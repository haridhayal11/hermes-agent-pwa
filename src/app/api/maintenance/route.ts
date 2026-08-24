import fs from "node:fs";
import { DB_PATH, db, pruneOldRunEvents } from "@/lib/db";

// Live proxy: never cached. Without this Next prerenders a zero-argument
// GET handler at build time and serves the snapshot forever.
export const dynamic = "force-dynamic";

/** WAL means the live size is the main file plus whatever hasn't checkpointed. */
function dbBytes(file: string): number {
  let total = 0;
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      total += fs.statSync(/*turbopackIgnore: true*/ `${file}${suffix}`).size;
    } catch {
      // -wal / -shm only exist while a connection is open
    }
  }
  return total;
}

export async function GET() {
  const file = DB_PATH;
  const count = (sql: string) =>
    (db.prepare(sql).get() as { n: number }).n;

  return Response.json({
    dbPath: file,
    dbBytes: dbBytes(file),
    projects: count(`SELECT COUNT(*) AS n FROM projects WHERE archived = 0`),
    archivedProjects: count(`SELECT COUNT(*) AS n FROM projects WHERE archived = 1`),
    runs: count(`SELECT COUNT(*) AS n FROM runs`),
    runEvents: count(`SELECT COUNT(*) AS n FROM run_events`),
    queued: count(`SELECT COUNT(*) AS n FROM queued_messages`),
    pushSubscriptions: count(`SELECT COUNT(*) AS n FROM push_subscriptions`),
    hermesUrl: new URL(process.env.HERMES_API_URL || "http://127.0.0.1:8642").host,
  });
}

/** Drops the replay log for runs that ended more than `hours` ago. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { hours?: number };
  const hours = typeof body.hours === "number" && body.hours > 0 ? body.hours : 24;
  const before = (db.prepare(`SELECT COUNT(*) AS n FROM run_events`).get() as {
    n: number;
  }).n;
  pruneOldRunEvents(hours * 60 * 60 * 1000);
  // VACUUM can't run inside a transaction and is the only thing that actually
  // returns the pages to the filesystem after a large prune.
  try {
    db.exec("VACUUM");
  } catch {
    // busy database — the rows are gone either way, only the file stays big
  }
  const after = (db.prepare(`SELECT COUNT(*) AS n FROM run_events`).get() as {
    n: number;
  }).n;
  return Response.json({ removed: before - after, runEvents: after });
}
