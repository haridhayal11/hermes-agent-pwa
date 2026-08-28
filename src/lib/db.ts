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
      last_chat_session_id TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_runs_session
      ON runs(project_id, session_id, started_at);

    /* A project is shared context (cwd, instructions, skills and model), while
     * sessions are the durable conversations displayed below it in both
     * clients. projects.session_id remains a server fallback pointer so old
     * browser routes keep working during the v1 migration; it is not UI state. */
    CREATE TABLE IF NOT EXISTS project_sessions (
      session_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      parent_session_id TEXT REFERENCES project_sessions(session_id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'scheduled'))
    );
    CREATE INDEX IF NOT EXISTS idx_project_sessions_project
      ON project_sessions(project_id, archived, last_active_at);
    CREATE INDEX IF NOT EXISTS idx_project_sessions_parent
      ON project_sessions(parent_session_id);

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
      session_id TEXT,
      body_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_queued_project ON queued_messages(project_id, created_at);

    /* Resource changes have a cursor namespace of their own. They are not run
     * events: a native client reconnecting with runId:seq must never apply it
     * here. Consumers refetch the named resource after each small event. */
    CREATE TABLE IF NOT EXISTS api_change_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_change_events_created
      ON api_change_events(created_at);

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
      ts INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_cron_deliveries_project
      ON cron_deliveries(project_id, session_id, ts);

    /* A normal discussion can be started from one scheduled report without
     * moving that report out of the project's Scheduled inbox. The link makes
     * the report both visible and available as model context in the new chat. */
    CREATE TABLE IF NOT EXISTS cron_discussions (
      session_id TEXT PRIMARY KEY REFERENCES project_sessions(session_id) ON DELETE CASCADE,
      delivery_id TEXT NOT NULL REFERENCES cron_deliveries(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cron_discussions_delivery
      ON cron_discussions(delivery_id);

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

    /* Native API clients authenticate independently of the browser UI.
     *
     * Access tokens and one-time pairing codes are never stored in plaintext:
     * only their SHA-256 digests reach SQLite. Pairing codes are created from
     * the host CLI, expire quickly and are deleted in the same transaction
     * that creates the device. */
    CREATE TABLE IF NOT EXISTS api_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_api_devices_active
      ON api_devices(token_hash) WHERE revoked_at IS NULL;

    /* Firebase Cloud Messaging registrations belong to an authenticated native
     * device. A device has one current Firebase Installation ID; registering a
     * rotated ID replaces the former target instead of leaving two phones that
     * are really the same installation in the fan-out. */
    CREATE TABLE IF NOT EXISTS native_push_subscriptions (
      device_id TEXT PRIMARY KEY REFERENCES api_devices(id) ON DELETE CASCADE,
      installation_id TEXT NOT NULL UNIQUE,
      kinds_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_native_push_installation
      ON native_push_subscriptions(installation_id);

    CREATE TABLE IF NOT EXISTS api_pairing_codes (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_pairing_codes_expiry
      ON api_pairing_codes(expires_at);

    /* A phone may lose the response to a successful send and retry it. The
     * reservation row prevents the same user message becoming two runs. */
    CREATE TABLE IF NOT EXISTS api_idempotency_keys (
      device_id TEXT NOT NULL REFERENCES api_devices(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_status INTEGER,
      response_body TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (device_id, key)
    );
    CREATE INDEX IF NOT EXISTS idx_api_idempotency_created
      ON api_idempotency_keys(created_at);
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
  addColumn(db, "projects", "last_chat_session_id", "TEXT");
  addColumn(db, "project_sessions", "kind", "TEXT NOT NULL DEFAULT 'chat'");
  addColumn(db, "queued_messages", "session_id", "TEXT");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_queued_session
    ON queued_messages(project_id, session_id, created_at)`);
  // JSON array of PushKind this device wants. NULL means every kind, which is
  // what a subscription created before the switches existed has to keep
  // meaning — an upgrade must not silently mute anyone.
  addColumn(db, "push_subscriptions", "kinds_json", "TEXT");
  dedupeCronDeliveries(db);
  dropBindingNotify(db);
  backfillProjectSessions(db);
  backfillLastChatSessionIds(db);
  migrateCronReadState(db);
  backfillQueuedSessionIds(db);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_sessions_scheduled
      ON project_sessions(project_id) WHERE kind = 'scheduled';
    CREATE INDEX IF NOT EXISTS idx_cron_deliveries_unread
      ON cron_deliveries(project_id, session_id, read_at);
    CREATE TRIGGER IF NOT EXISTS project_sessions_kind_insert
      BEFORE INSERT ON project_sessions
      WHEN NEW.kind NOT IN ('chat', 'scheduled')
      BEGIN SELECT RAISE(ABORT, 'invalid project session kind'); END;
    CREATE TRIGGER IF NOT EXISTS project_sessions_kind_update
      BEFORE UPDATE OF kind ON project_sessions
      WHEN NEW.kind NOT IN ('chat', 'scheduled')
      BEGIN SELECT RAISE(ABORT, 'invalid project session kind'); END;
  `);
}

/** Existing reports stay exactly where they were and must not become unread
 * merely because an upgrade introduced read tracking. */
function migrateCronReadState(db: Database.Database) {
  const columns = db.prepare(`PRAGMA table_info(cron_deliveries)`).all() as {
    name: string;
  }[];
  if (columns.some((column) => column.name === "read_at")) return;
  addColumn(db, "cron_deliveries", "read_at", "INTEGER");
  db.exec(`UPDATE cron_deliveries SET read_at = ts WHERE read_at IS NULL`);
}

/**
 * Turns the former one-session pointer into a first-class tree without losing
 * sessions that were replaced by /new but still have local run/delivery rows.
 * Their parent is unknowable, so historical rows become roots. The active
 * session gets the project's name; older rows use their prompt preview when
 * possible and can be renamed normally afterwards.
 */
function backfillProjectSessions(db: Database.Database) {
  const now = Date.now();
  db.exec(`
    INSERT OR IGNORE INTO project_sessions
      (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived)
    SELECT p.session_id, p.id, p.name, NULL, p.created_at, p.last_active_at, 0
      FROM projects p;

    INSERT OR IGNORE INTO project_sessions
      (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived)
    SELECT r.session_id,
           r.project_id,
           COALESCE(NULLIF(MIN(r.prompt_preview), ''), 'Previous chat'),
           NULL,
           MIN(r.started_at),
           MAX(COALESCE(r.ended_at, r.started_at)),
           0
      FROM runs r
     GROUP BY r.project_id, r.session_id;

    INSERT OR IGNORE INTO project_sessions
      (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived)
    SELECT d.session_id,
           d.project_id,
           'Previous chat',
           NULL,
           MIN(d.ts),
           MAX(d.ts),
           0
      FROM cron_deliveries d
     GROUP BY d.project_id, d.session_id;
  `);

  // Empty databases never use this value, but binding it documents that a
  // migration must not manufacture a zero timestamp if an old row is odd.
  db.prepare(
    `UPDATE project_sessions SET created_at = ?, last_active_at = ?
      WHERE created_at IS NULL OR last_active_at IS NULL`,
  ).run(now, now);
}

function backfillLastChatSessionIds(db: Database.Database) {
  db.exec(`
    UPDATE projects
       SET last_chat_session_id = COALESCE(
         last_chat_session_id,
         CASE WHEN EXISTS (
           SELECT 1 FROM project_sessions ps
            WHERE ps.project_id = projects.id
              AND ps.session_id = projects.session_id
              AND ps.kind = 'chat'
         ) THEN session_id END,
         (
           SELECT ps.session_id FROM project_sessions ps
            WHERE ps.project_id = projects.id AND ps.kind = 'chat'
            ORDER BY ps.last_active_at DESC, ps.created_at DESC LIMIT 1
         )
       )
     WHERE last_chat_session_id IS NULL;
  `);
}

function backfillQueuedSessionIds(db: Database.Database) {
  db.exec(`
    UPDATE queued_messages
       SET session_id = (
         SELECT p.session_id FROM projects p WHERE p.id = queued_messages.project_id
       )
     WHERE session_id IS NULL;
  `);
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
