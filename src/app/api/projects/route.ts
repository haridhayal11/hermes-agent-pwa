import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { PROJECT_TEMPLATES } from "@/lib/instructions";
import { createProjectSession, hermesErrorResponse } from "@/lib/project-session";
import { publishChange } from "@/lib/api-changes";
import { registerInitialSession } from "@/lib/project-sessions";

// Live proxy: never cached. Without this Next prerenders a zero-argument
// GET handler at build time and serves the snapshot forever.
export const dynamic = "force-dynamic";


function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || randomUUID().slice(0, 8);
}

export async function GET(request: Request) {
  // ?archived=1 is what /settings uses to offer un-archiving; everything else
  // wants the live list, so that stays the default.
  const archived =
    new URL(request.url).searchParams.get("archived") === "1" ? 1 : 0;
  const projects = db
    .prepare(
      `SELECT * FROM projects WHERE archived = ?
       ORDER BY pinned DESC, last_active_at DESC`,
    )
    .all(archived);
  return Response.json({ projects });
}

export async function POST(request: Request) {
  const body = await request.json();
  const name: string = body.name;
  if (!name || typeof name !== "string") {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const cwd: string | null = typeof body.cwd === "string" ? body.cwd : null;
  const color: string | null = typeof body.color === "string" ? body.color : null;

  // A template only seeds the initial values; explicit fields win over it.
  const template = PROJECT_TEMPLATES.find((t) => t.id === body.template);
  const emoji: string | null =
    typeof body.emoji === "string" ? body.emoji : (template?.emoji ?? null);
  const instructions: string | null =
    typeof body.instructions === "string"
      ? body.instructions
      : (template?.instructions || null);
  const pinned = body.pinned ? 1 : 0;
  const skills: string[] = Array.isArray(body.skills)
    ? body.skills.filter((v: unknown): v is string => typeof v === "string" && !!v.trim())
    : [];

  const id = `proj_${slugify(name)}_${randomUUID().slice(0, 6)}`;
  const sessionId = id;

  // Hermes titles are globally unique and a deleted project keeps its session,
  // so the title may still be taken; the local name is unaffected either way.
  try {
    await createProjectSession(sessionId, name);
  } catch (err) {
    return hermesErrorResponse(err);
  }

  const now = Date.now();
  db.prepare(
    `INSERT INTO projects (id, name, emoji, color, cwd, instructions, pinned, skills, session_id, created_at, last_active_at, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(id, name, emoji, color, cwd, instructions, pinned, skills.length ? JSON.stringify(skills) : null, sessionId, now, now);
  registerInitialSession(id, sessionId, name, now);
  publishChange("project.changed", { projectId: id });

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  return Response.json({ project }, { status: 201 });
}
