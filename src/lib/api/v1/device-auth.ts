import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";

const TOKEN_PREFIX = "hms_v1_";
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60_000;

export interface ApiDevice {
  id: string;
  name: string;
  platform: string;
  createdAt: number;
  lastSeenAt: number;
}

interface ApiDeviceRow {
  id: string;
  name: string;
  platform: string;
  created_at: number;
  last_seen_at: number;
}

function digest(namespace: "token" | "pairing", value: string): string {
  return createHash("sha256")
    .update(`hermes-native-api:${namespace}:`, "utf8")
    .update(value, "utf8")
    .digest("hex");
}

export function normalizePairingCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function pairingCodeHash(code: string): string {
  return digest("pairing", normalizePairingCode(code));
}

function tokenHash(token: string): string {
  return digest("token", token);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer ([!-~]+)$/.exec(header);
  if (!match || !match[1].startsWith(TOKEN_PREFIX) || match[1].length > 128) {
    return null;
  }
  return match[1];
}

function asDevice(row: ApiDeviceRow): ApiDevice {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function authenticateDevice(request: Request): ApiDevice | null {
  const token = bearerToken(request);
  if (!token) return null;

  const row = db
    .prepare(
      `SELECT id, name, platform, created_at, last_seen_at
         FROM api_devices
        WHERE token_hash = ? AND revoked_at IS NULL`,
    )
    .get(tokenHash(token)) as ApiDeviceRow | undefined;
  if (!row) return null;

  const now = Date.now();
  if (row.last_seen_at < now - LAST_SEEN_WRITE_INTERVAL_MS) {
    db.prepare(`UPDATE api_devices SET last_seen_at = ? WHERE id = ?`).run(
      now,
      row.id,
    );
    row.last_seen_at = now;
  }
  return asDevice(row);
}

export type PairingClaimResult =
  | { ok: false }
  | { ok: true; device: ApiDevice; accessToken: string };

/**
 * Atomically consumes one host-issued code and creates a device credential.
 * A failed or expired code always has the same result so the endpoint does
 * not reveal which codes recently existed.
 */
export function claimPairingCode(
  code: string,
  deviceName: string,
  platform = "android",
): PairingClaimResult {
  const normalized = normalizePairingCode(code);
  if (normalized.length !== 12) return { ok: false };

  const now = Date.now();
  const accessToken = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const id = `dev_${randomUUID()}`;

  return db.transaction((): PairingClaimResult => {
    db.prepare(`DELETE FROM api_pairing_codes WHERE expires_at <= ?`).run(now);
    const pairing = db
      .prepare(
        `SELECT id FROM api_pairing_codes
          WHERE code_hash = ? AND expires_at > ?`,
      )
      .get(pairingCodeHash(normalized), now) as { id: string } | undefined;
    if (!pairing) return { ok: false };

    db.prepare(
      `INSERT INTO api_devices
        (id, name, platform, token_hash, created_at, last_seen_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    ).run(id, deviceName, platform, tokenHash(accessToken), now, now);
    db.prepare(`DELETE FROM api_pairing_codes WHERE id = ?`).run(pairing.id);

    return {
      ok: true,
      device: {
        id,
        name: deviceName,
        platform,
        createdAt: now,
        lastSeenAt: now,
      },
      accessToken,
    };
  })();
}

export function revokeDevice(id: string): void {
  db.prepare(
    `UPDATE api_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
  ).run(Date.now(), id);
}
