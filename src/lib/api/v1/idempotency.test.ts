import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-idempotency-"));
process.env.DB_PATH = path.join(directory, "test.db");

let idempotentJson: typeof import("./idempotency").idempotentJson;

beforeAll(async () => {
  vi.resetModules();
  const database = await import("@/lib/db");
  database.db.prepare(
    `INSERT INTO api_devices (id, name, platform, token_hash, created_at, last_seen_at)
     VALUES ('device', 'test', 'android', 'hash', 1, 1)`,
  ).run();
  idempotentJson = (await import("./idempotency")).idempotentJson;
});

afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

describe("idempotentJson", () => {
  it("executes once and replays the stored JSON response", async () => {
    let calls = 0;
    const makeRequest = () => new Request("http://test/write", {
      method: "POST",
      headers: { "Idempotency-Key": "prompt-123", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    const action = async () => {
      calls += 1;
      return Response.json({ ok: true }, { status: 201 });
    };
    const first = await idempotentJson(makeRequest(), "device", "POST:test", action);
    const replay = await idempotentJson(makeRequest(), "device", "POST:test", action);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(calls).toBe(1);
  });

  it("rejects reuse with a different request", async () => {
    const request = new Request("http://test/write", {
      method: "POST",
      headers: { "Idempotency-Key": "prompt-123", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "different" }),
    });
    const response = await idempotentJson(request, "device", "POST:test", async () => Response.json({ ok: true }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "idempotency_conflict" } });
  });
});
