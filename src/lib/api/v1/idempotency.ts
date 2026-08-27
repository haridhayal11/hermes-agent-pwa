import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { error, versioned } from "./http";

const RETAIN_MS = 24 * 60 * 60_000;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

interface StoredRequest {
  request_hash: string;
  response_status: number | null;
  response_body: string | null;
}

/**
 * At-most-once execution for mobile writes whose successful HTTP response may
 * be lost during a network transition. Only successful JSON responses are
 * retained; validation and upstream failures remain retryable.
 */
export async function idempotentJson(
  request: Request,
  deviceId: string,
  scope: string,
  action: () => Promise<Response>,
): Promise<Response> {
  const key = request.headers.get("idempotency-key") ?? "";
  if (!KEY_PATTERN.test(key)) {
    return error(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key must be 8-128 URL-safe characters.",
    );
  }

  const body = await request.clone().text();
  const requestHash = createHash("sha256")
    .update(`${scope}\n`, "utf8")
    .update(body, "utf8")
    .digest("hex");
  const now = Date.now();

  db.prepare(`DELETE FROM api_idempotency_keys WHERE created_at < ?`).run(
    now - RETAIN_MS,
  );

  const reservation = db
    .prepare(
      `INSERT INTO api_idempotency_keys
        (device_id, key, request_hash, response_status, response_body, created_at)
       VALUES (?, ?, ?, NULL, NULL, ?)
       ON CONFLICT(device_id, key) DO NOTHING`,
    )
    .run(deviceId, key, requestHash, now);

  if (reservation.changes === 0) {
    const stored = db
      .prepare(
        `SELECT request_hash, response_status, response_body
           FROM api_idempotency_keys WHERE device_id = ? AND key = ?`,
      )
      .get(deviceId, key) as StoredRequest | undefined;

    if (!stored || stored.request_hash !== requestHash) {
      return error(
        409,
        "idempotency_conflict",
        "That Idempotency-Key was already used for a different request.",
      );
    }
    if (stored.response_status === null || stored.response_body === null) {
      return error(
        409,
        "request_in_progress",
        "A request with that Idempotency-Key is still in progress.",
      );
    }
    return versioned(
      new Response(stored.response_body, {
        status: stored.response_status,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Replayed": "true",
        },
      }),
    );
  }

  try {
    const response = await action();
    if (
      response.ok &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      const responseBody = await response.clone().text();
      db.prepare(
        `UPDATE api_idempotency_keys
            SET response_status = ?, response_body = ?
          WHERE device_id = ? AND key = ?`,
      ).run(response.status, responseBody, deviceId, key);
    } else {
      db.prepare(
        `DELETE FROM api_idempotency_keys WHERE device_id = ? AND key = ?`,
      ).run(deviceId, key);
    }
    return response;
  } catch (cause) {
    db.prepare(
      `DELETE FROM api_idempotency_keys WHERE device_id = ? AND key = ?`,
    ).run(deviceId, key);
    throw cause;
  }
}
