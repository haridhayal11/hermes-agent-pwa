import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sendEachForMulticast = vi.hoisted(() => vi.fn());
vi.mock("firebase-admin/app", () => ({
  applicationDefault: vi.fn(() => ({ kind: "test-credential" })),
  getApps: vi.fn(() => [{ name: "test" }]),
  initializeApp: vi.fn(),
}));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn(() => ({ sendEachForMulticast })),
}));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-native-push-"));
process.env.DB_PATH = path.join(directory, "test.db");
process.env.FIREBASE_PROJECT_ID = "test-project";
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

let database: typeof import("./db");
let push: typeof import("./push");
let notificationsRoute: typeof import("@/app/api/v1/notifications/route");
let token = "";

beforeAll(async () => {
  vi.resetModules();
  database = await import("./db");
  push = await import("./push");
  const auth = await import("./api/v1/device-auth");
  const code = "ABCD1234EFGH";
  database.db.prepare(
    `INSERT INTO api_pairing_codes (id, code_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run("pair", auth.pairingCodeHash(code), Date.now(), Date.now() + 60_000);
  const claim = auth.claimPairingCode(code, "Test phone");
  if (!claim.ok) throw new Error("test pairing failed");
  token = claim.accessToken;
  notificationsRoute = await import("@/app/api/v1/notifications/route");
});

afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

function request(method: string, body?: unknown, key = `request-${method.toLowerCase()}-01`) {
  return new Request("http://test/api/v1/notifications", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": key,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("native notification subscriptions", () => {
  it("requires paired-device authentication", async () => {
    const response = await notificationsRoute.GET(
      new Request("http://test/api/v1/notifications"),
    );
    expect(response.status).toBe(401);
  });

  it("registers idempotently and validates kinds", async () => {
    const payload = { installationId: "fid-primary-123456", kinds: ["run", "approval"] };
    const first = await notificationsRoute.PUT(request("PUT", payload, "register-0001"));
    const replay = await notificationsRoute.PUT(request("PUT", payload, "register-0001"));
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      configured: true,
      enabled: true,
      kinds: ["run", "approval"],
    });
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");

    const invalid = await notificationsRoute.PATCH(
      request("PATCH", { kinds: ["unknown"] }, "bad-kinds-001"),
    );
    expect(invalid.status).toBe(400);
  });

  it("rotates and moves a FID without leaving duplicates", () => {
    const device = database.db.prepare(
      `SELECT id FROM api_devices WHERE name = 'Test phone'`,
    ).get() as { id: string };
    push.saveNativeSubscription(device.id, "fid-rotated-123456", ["question"]);
    database.db.prepare(
      `INSERT INTO api_devices (id, name, platform, token_hash, created_at, last_seen_at)
       VALUES ('second-device', 'Second', 'android', 'second-hash', 1, 1)`,
    ).run();
    push.saveNativeSubscription("second-device", "fid-rotated-123456", ["job"]);
    const rows = database.db.prepare(
      `SELECT device_id, installation_id FROM native_push_subscriptions`,
    ).all() as { device_id: string; installation_id: string }[];
    expect(rows).toEqual([
      { device_id: "second-device", installation_id: "fid-rotated-123456" },
    ]);
  });

  it("filters kinds, chunks FIDs, and removes stale registrations", async () => {
    database.db.prepare(`DELETE FROM native_push_subscriptions`).run();
    const insertDevice = database.db.prepare(
      `INSERT INTO api_devices
        (id, name, platform, token_hash, created_at, last_seen_at)
       VALUES (?, ?, 'android', ?, 1, 1)`,
    );
    for (let index = 0; index < 502; index += 1) {
      const id = `fanout-${index}`;
      insertDevice.run(id, id, `hash-${index}`);
      push.saveNativeSubscription(id, `fid-${index}-123456`, ["run"]);
    }
    database.db.prepare(
      `UPDATE native_push_subscriptions SET kinds_json = '["job"]'
        WHERE device_id = 'fanout-0'`,
    ).run();
    sendEachForMulticast.mockImplementation(async (message: { fids: string[] }) => ({
      successCount: message.fids.length - (message.fids.includes("fid-501-123456") ? 1 : 0),
      failureCount: message.fids.includes("fid-501-123456") ? 1 : 0,
      responses: message.fids.map((fid) =>
        fid === "fid-501-123456"
          ? {
              success: false,
              error: {
                code: "messaging/installation-id-not-registered",
                message: "stale",
              },
            }
          : { success: true },
      ),
    }));

    const result = await push.sendToAll({ title: "Done", body: "Run done", kind: "run" });
    expect(sendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(sendEachForMulticast.mock.calls[0][0].fids).toHaveLength(500);
    expect(sendEachForMulticast.mock.calls[1][0].fids).toHaveLength(1);
    expect(result).toMatchObject({ sent: 500, failed: 1 });
    const stale = database.db.prepare(
      `SELECT 1 FROM native_push_subscriptions WHERE installation_id = 'fid-501-123456'`,
    ).get();
    expect(stale).toBeUndefined();
    expect(push.wantsKind('["job"]', "run")).toBe(false);
    expect(push.wantsKind("[]", "test")).toBe(true);
  });

  it("revocation and DELETE remove the device target", async () => {
    const auth = await import("./api/v1/device-auth");
    push.saveNativeSubscription("second-device", "fid-revoke-123456", ["run"]);
    auth.revokeDevice("second-device");
    expect(push.nativeSubscription("second-device").enabled).toBe(false);

    const response = await notificationsRoute.DELETE(
      request("DELETE", undefined, "delete-target-01"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ enabled: false });
  });
});
