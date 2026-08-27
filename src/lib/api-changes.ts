import { EventEmitter } from "node:events";
import { db } from "./db";

const RETAIN_MS = 24 * 60 * 60_000;

export interface ApiChangeEvent {
  sequence: number;
  type: string;
  occurredAt: number;
  payload: Record<string, unknown>;
}

const globalForChanges = globalThis as unknown as {
  __hermesApiChanges?: EventEmitter;
};

const emitter = globalForChanges.__hermesApiChanges ?? new EventEmitter();
emitter.setMaxListeners(0);
if (!globalForChanges.__hermesApiChanges) globalForChanges.__hermesApiChanges = emitter;

function rowEvent(row: {
  seq: number;
  type: string;
  payload_json: string;
  created_at: number;
}): ApiChangeEvent {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.payload_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    // A malformed historical row becomes an empty invalidation, never a dead
    // resource stream.
  }
  return {
    sequence: row.seq,
    type: row.type,
    occurredAt: row.created_at,
    payload,
  };
}

export function publishChange(
  type: string,
  payload: Record<string, unknown>,
): ApiChangeEvent {
  const occurredAt = Date.now();
  const result = db
    .prepare(
      `INSERT INTO api_change_events (type, payload_json, created_at)
       VALUES (?, ?, ?)`,
    )
    .run(type, JSON.stringify(payload), occurredAt);
  const event: ApiChangeEvent = {
    sequence: Number(result.lastInsertRowid),
    type,
    occurredAt,
    payload,
  };
  emitter.emit("change", event);
  db.prepare(`DELETE FROM api_change_events WHERE created_at < ?`).run(
    occurredAt - RETAIN_MS,
  );
  return event;
}

export function changesAfter(sequence: number): {
  events: ApiChangeEvent[];
  reset: boolean;
} {
  const bounds = db
    .prepare(
      `SELECT COALESCE(MIN(seq), 0) AS minimum, COALESCE(MAX(seq), 0) AS maximum
         FROM api_change_events`,
    )
    .get() as { minimum: number; maximum: number };
  const reset = sequence > 0 && bounds.minimum > 0 && sequence < bounds.minimum - 1;
  if (reset) return { events: [], reset: true };
  const rows = db
    .prepare(
      `SELECT seq, type, payload_json, created_at
         FROM api_change_events WHERE seq > ? ORDER BY seq ASC`,
    )
    .all(sequence) as {
    seq: number;
    type: string;
    payload_json: string;
    created_at: number;
  }[];
  return { events: rows.map(rowEvent), reset: false };
}

export function subscribeChanges(
  listener: (event: ApiChangeEvent) => void,
): () => void {
  emitter.on("change", listener);
  return () => emitter.off("change", listener);
}
