import { db } from "@/lib/db";

/* Cross-project search over our own SQLite: project names, project
 * instructions, the prompt that started each run, and what a scheduled job
 * reported.
 *
 * Deliberately not the transcripts. Hermes has no search endpoint — covering
 * message bodies would mean fanning out to /api/sessions/{id}/messages for
 * every project on every keystroke, which is slow, unbounded, and dies the
 * moment Hermes is unreachable. The response says which scope it covered so a
 * transcript pass can be added later without changing the shape.
 *
 * Cron deliveries are the one *body* that is searchable, and only because
 * they are ours: Hermes ran the job in its own session, so our
 * cron_deliveries row is the only copy anywhere in this app. */

interface ProjectHit {
  id: string;
  name: string;
  emoji: string | null;
  /** why it matched — the instructions excerpt, when the name didn't match */
  snippet: string | null;
}

interface DeliveryHit {
  id: string;
  projectId: string;
  projectName: string;
  projectEmoji: string | null;
  jobName: string;
  snippet: string;
  ts: number;
}

interface MessageHit {
  projectId: string;
  projectName: string;
  projectEmoji: string | null;
  runId: string;
  preview: string;
  startedAt: number;
}

/** LIKE treats % and _ as wildcards; a user searching for "50%" means "50%". */
function likeTerm(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function excerpt(haystack: string, needle: string, radius = 60): string {
  const at = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return haystack.slice(0, radius * 2).trim();
  const start = Math.max(0, at - radius);
  const end = Math.min(haystack.length, at + needle.length + radius);
  return `${start > 0 ? "…" : ""}${haystack.slice(start, end).trim()}${
    end < haystack.length ? "…" : ""
  }`;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return Response.json({
      projects: [],
      messages: [],
      deliveries: [],
      scope: "local",
      q,
    });
  }

  const term = likeTerm(q);

  const projectRows = db
    .prepare(
      `SELECT id, name, emoji, instructions
         FROM projects
        WHERE archived = 0
          AND (name LIKE ? ESCAPE '\\' OR instructions LIKE ? ESCAPE '\\')
        ORDER BY pinned DESC, last_active_at DESC
        LIMIT 20`,
    )
    .all(term, term) as {
    id: string;
    name: string;
    emoji: string | null;
    instructions: string | null;
  }[];

  const projects: ProjectHit[] = projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    snippet:
      row.name.toLowerCase().includes(q.toLowerCase()) || !row.instructions
        ? null
        : excerpt(row.instructions, q),
  }));

  const messageRows = db
    .prepare(
      `SELECT r.run_id AS runId, r.project_id AS projectId, r.started_at AS startedAt,
              r.prompt_preview AS preview, p.name AS projectName, p.emoji AS projectEmoji
         FROM runs r
         JOIN projects p ON p.id = r.project_id
        WHERE p.archived = 0
          AND r.prompt_preview LIKE ? ESCAPE '\\'
        ORDER BY r.started_at DESC
        LIMIT 40`,
    )
    .all(term) as MessageHit[];

  const messages = messageRows.map((row) => ({
    ...row,
    preview: excerpt(row.preview ?? "", q),
  }));

  const deliveryRows = db
    .prepare(
      `SELECT d.id, d.project_id AS projectId, d.job_name AS jobName,
              d.body, d.ts, p.name AS projectName, p.emoji AS projectEmoji
         FROM cron_deliveries d
         JOIN projects p ON p.id = d.project_id
        WHERE p.archived = 0
          AND d.session_id = p.session_id
          AND d.body LIKE ? ESCAPE '\\'
        ORDER BY d.ts DESC
        LIMIT 40`,
    )
    .all(term) as (Omit<DeliveryHit, "snippet"> & { body: string })[];

  const deliveries: DeliveryHit[] = deliveryRows.map(({ body, ...row }) => ({
    ...row,
    snippet: excerpt(body, q),
  }));

  return Response.json({ projects, messages, deliveries, scope: "local", q });
}
