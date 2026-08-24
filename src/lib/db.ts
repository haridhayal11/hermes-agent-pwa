import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_SLUG } from "./branding";

const DEFAULT_DB_PATH = path.join(os.homedir(), `.${APP_SLUG}`, "state.db");
export const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

/** Everything we own on disk sits beside the database, wherever it was put. */
export function dataDir(): string {
  return path.dirname(DB_PATH);
}

// Next dev's HMR reloads this module on every edit; a module-level singleton
// would open a fresh handle each time, so pin it to globalThis instead.
const globalForDb = globalThis as unknown as { __hermesPwaDb?: Database.Database };

function openDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT,
      color TEXT,
      cwd TEXT,
      instructions TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      prompt_preview TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, started_at);

    CREATE TABLE IF NOT EXISTS run_events (
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_json TEXT NOT NULL,
      ts INTEGER NOT NULL,
      PRIMARY KEY (run_id, seq)
    );

    CREATE TABLE IF NOT EXISTS queued_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      body_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_queued_project ON queued_messages(project_id, created_at);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      keys_json TEXT NOT NULL,
      ua TEXT,
      created_at INTEGER NOT NULL
    );

    /* Which project a Hermes cron job delivers into.
     *
     * Deliberately not the job's own \`deliver\` field: Hermes writes every
     * job's output to disk whatever \`deliver\` says, so binding a project to
     * an existing job adds this app as a destination without taking Telegram
     * away from it. The job itself stays entirely Hermes' to schedule. */
    CREATE TABLE IF NOT EXISTS cron_bindings (
      job_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      -- The output file of the fire we have already delivered. A path, not a
      -- timestamp: Hermes reports two timestamps per fire that differ by
      -- milliseconds, so comparing them made an old fire look new forever.
      last_seen_at TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cron_bindings_project
      ON cron_bindings(project_id);

    /* What a job actually said, on our side of the wire.
     *
     * The transcript belongs to Hermes and a cron result is not in it, so this
     * is the durable copy — it is what /api/projects/[id]/messages merges into
     * the thread on reload, and it outlives Hermes deleting its own output
     * directory when a job is removed. */
    CREATE TABLE IF NOT EXISTS cron_deliveries (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      -- Scoped to the session it landed in, the same way runs are. /new
      -- repoints a project at a fresh session, and a thread that has just
      -- been reset must not paint yesterday's deliveries back into it.
      session_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      body TEXT NOT NULL,
      source_path TEXT,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cron_deliveries_project
      ON cron_deliveries(project_id, session_id, ts);

    /* Install-wide settings — the ones the *server* has to be able to read.
     *
     * Per-device display preferences stay in localStorage and deliberately
     * have no table (see preferences.ts). This is for the other kind: the
     * agent's name goes out in push payloads, which Node composes, so it
     * cannot live in a browser. */
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  migrate(db);
  return db;
}

/**
 * CREATE TABLE IF NOT EXISTS is a no-op on databases created by an earlier
 * schema, so columns added after Phase 1 have to be ALTERed in. SQLite has no
 * ADD COLUMN IF NOT EXISTS, so check table_info first.
 */
function migrate(db: Database.Database) {
  addColumn(db, "projects", "instructions", "TEXT");
  addColumn(db, "projects", "pinned", "INTEGER NOT NULL DEFAULT 0");
  // JSON array of Hermes skill names linked to this project.
  addColumn(db, "projects", "skills", "TEXT");
  // Per-run model override. NULL = whatever the gateway defaults to, which is
  // what every project used before there was a picker.
  addColumn(db, "projects", "model", "TEXT");
  addColumn(db, "projects", "provider", "TEXT");
  // JSON of Hermes model_options: {reasoning:{enabled,effort}, fast}
  addColumn(db, "projects", "model_options", "TEXT");
  // JSON array of PushKind this device wants. NULL means every kind, which is
  // what a subscription created before the switches existed has to keep
  // meaning — an upgrade must not silently mute anyone.
  addColumn(db, "push_subscriptions", "kinds_json", "TEXT");
  dedupeCronDeliveries(db);
  dropBindingNotify(db);
}

/**
 * A binding used to carry always / on-failure / never.
 *
 * It existed because a job could deliver to a project here *and* to Telegram,
 * so the same fire could alert twice and one of them had to be muted. A job
 * has one destination now, which removes the case the switch was answering —
 * whether this device wants job notifications at all is a per-device question,
 * and Settings already asks it.
 *
 * SQLite has no DROP COLUMN before 3.35 and better-sqlite3's bundled version
 * varies, so this rebuilds the table rather than assuming.
 */
function dropBindingNotify(db: Database.Database) {
  const columns = db.prepare(`PRAGMA table_info(cron_bindings)`).all() as {
    name: string;
  }[];
  if (!columns.some((c) => c.name === "notify")) return;
  try {
    db.exec(`
      BEGIN;
      CREATE TABLE cron_bindings_new (
        job_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        last_seen_at TEXT,
        created_at INTEGER NOT NULL
      );
      INSERT INTO cron_bindings_new (job_id, project_id, last_seen_at, created_at)
        SELECT job_id, project_id, last_seen_at, created_at FROM cron_bindings;
      DROP TABLE cron_bindings;
      ALTER TABLE cron_bindings_new RENAME TO cron_bindings;
      CREATE INDEX IF NOT EXISTS idx_cron_bindings_project
        ON cron_bindings(project_id);
      COMMIT;
    `);
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // no transaction open — the failure happened before BEGIN took
    }
    console.error("[db] dropping cron_bindings.notify failed:", err);
  }
}

/**
 * One output file, one message.
 *
 * The watcher used to key a fire on a timestamp, and Hermes reports two that
 * differ by milliseconds — `latest_execution.finished_at` and `last_run_at` —
 * so the same file could be delivered twice. The index is the guarantee that
 * it cannot happen again whatever the caller believes; the delete is what
 * makes the index creatable on a database that already has the duplicates.
 */
function dedupeCronDeliveries(db: Database.Database) {
  try {
    db.exec(`
      DELETE FROM cron_deliveries
       WHERE rowid NOT IN (
         SELECT MIN(rowid) FROM cron_deliveries GROUP BY job_id, source_path
       );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cron_deliveries_source
        ON cron_deliveries(job_id, source_path);
    `);
  } catch (err) {
    // Same parallel-worker race addColumn guards against — losing it is fine.
    console.error("[db] cron delivery dedupe failed:", err);
  }
}

function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
) {
  const exists = (
    db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).some((c) => c.name === column);
  if (exists) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch (err) {
    // next build collects routes in parallel workers, each opening its own
    // handle — two can pass the check above and both try to ALTER. Losing
    // that race is fine; anything else is a real error.
    if (!/duplicate column name/i.test(String(err))) throw err;
  }
}

export const db = globalForDb.__hermesPwaDb ?? openDb();
if (!globalForDb.__hermesPwaDb) globalForDb.__hermesPwaDb = db;

/** Deletes run_events for runs that ended more than `maxAgeMs` ago. */
export function pruneOldRunEvents(maxAgeMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  db.prepare(
    `DELETE FROM run_events WHERE run_id IN (
       SELECT run_id FROM runs WHERE ended_at IS NOT NULL AND ended_at < ?
     )`,
  ).run(cutoff);
}
