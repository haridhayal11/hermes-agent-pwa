#!/usr/bin/env node

import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const PAIRING_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const DEFAULT_DB_PATH = join(homedir(), ".hermes-pwa", "state.db");

function loadEnvFile(filename) {
  if (!existsSync(filename)) return;
  for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(".env.production");
loadEnvFile(".env.local");

function digest(value) {
  return createHash("sha256")
    .update("hermes-native-api:pairing:", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function code() {
  const bytes = randomBytes(12);
  let value = "";
  for (const byte of bytes) value += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = new Map();
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith("--")) continue;
    options.set(rest[i].slice(2), rest[i + 1]?.startsWith("--") ? "" : rest[++i]);
  }
  return { command, options };
}

const { command, options } = parseArgs(process.argv.slice(2));
const dbPath = options.get("db") || process.env.DB_PATH || DEFAULT_DB_PATH;
mkdirSync(dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS api_devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS api_pairing_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_idempotency_keys (
    device_id TEXT NOT NULL REFERENCES api_devices(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (device_id, key)
  );
`);

if (command === "pair") {
  const pairingCode = code();
  const now = Date.now();
  const minutes = Number(options.get("minutes") || 10);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) {
    console.error("--minutes must be between 1 and 60");
    process.exitCode = 1;
  } else {
    db.transaction(() => {
      db.prepare(`DELETE FROM api_pairing_codes WHERE expires_at <= ?`).run(now);
      db.prepare(
        `INSERT INTO api_pairing_codes (id, code_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      ).run(`pair_${randomUUID()}`, digest(pairingCode.replaceAll("-", "")), now, now + minutes * 60_000);
    })();
    console.log(pairingCode);
    console.error(`Expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }
} else if (command === "list") {
  const rows = db.prepare(
    `SELECT id, name, platform, created_at, last_seen_at, revoked_at
       FROM api_devices ORDER BY created_at DESC`,
  ).all();
  console.table(rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    created: new Date(row.created_at).toISOString(),
    lastSeen: new Date(row.last_seen_at).toISOString(),
    revoked: row.revoked_at ? new Date(row.revoked_at).toISOString() : "",
  })));
} else if (command === "revoke") {
  const id = options.get("id");
  if (!id) {
    console.error("Usage: pnpm device revoke --id <device-id>");
    process.exitCode = 1;
  } else {
    const result = db.prepare(
      `UPDATE api_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
    ).run(Date.now(), id);
    if (result.changes === 0) {
      console.error("No active device matched that id.");
      process.exitCode = 1;
    } else {
      console.log(`Revoked ${id}`);
    }
  }
} else {
  console.error("Usage: pnpm device <pair|list|revoke> [--minutes 10] [--id <device-id>] [--db <path>]");
  process.exitCode = 1;
}

db.close();
