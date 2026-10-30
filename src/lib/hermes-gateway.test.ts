import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* The slash-command bridge against a stand-in gateway owner: a control
 * socket that answers identify / session-ticket, and just enough of a
 * WebSocket server to see the handshake and one JSON-RPC exchange. It pins
 * the wire details a real gateway refuses on — the ticket subprotocol, no
 * Origin header, the exact slash.exec params — without needing one. */

const home = fs.mkdtempSync(path.join(os.tmpdir(), "hgw-"));
process.env.HERMES_HOME = home;
const seen: { headers?: http.IncomingHttpHeaders; rpc?: unknown; control: unknown[] } = { control: [] };
let reply: unknown = { jsonrpc: "2.0", id: 1, result: { type: "exec", output: "**Tokens:** 12" } };

function frame(text: string) {
  const payload = Buffer.from(text);
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
}
function unmask(buf: Buffer): string {
  let len = buf[1] & 127, off = 2;
  if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
  const mask = buf.subarray(off, off + 4); off += 4;
  const out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) out[i] = buf[off + i] ^ mask[i % 4];
  return out.toString();
}

let httpServer: http.Server;
let control: net.Server;
beforeAll(async () => {
  httpServer = http.createServer();
  httpServer.on("upgrade", (req, socket) => {
    seen.headers = req.headers;
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: hermes-gateway-v1\r\n\r\n`);
    socket.write(frame(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready" } })));
    socket.on("data", (buf) => {
      if ((buf[0] & 15) !== 1) return;
      seen.rpc = JSON.parse(unmask(buf));
      socket.write(frame(JSON.stringify(reply)));
    });
  });
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
  const port = (httpServer.address() as net.AddressInfo).port;
  control = net.createServer((sock) => {
    sock.setEncoding("utf8");
    sock.on("data", (line: string) => {
      const req = JSON.parse(line.trim());
      seen.control.push(req);
      const result = req.verb === "identify"
        ? { state: "ready", capabilities: ["session-authority-v1"], instance_id: "I1", api_origin: `http://127.0.0.1:${port}`, served_profiles: [{ home, profile_id: "P1" }] }
        : { ticket: "T123", profile_id: "P1", instance_id: "I1", runtime_protocol: 1 };
      sock.end(JSON.stringify({ ok: true, protocol: 1, id: 1, result }) + "\n");
    });
  });
  await new Promise<void>((r) => control.listen(path.join(home, "gateway.sock"), () => r()));
});
afterAll(() => {
  httpServer.close();
  control.close();
  fs.rmSync(home, { recursive: true, force: true });
});

describe("hermes-gateway against a mock owner", () => {
  it("bootstraps a ticket and runs slash.exec", async () => {
    const { execSlashCommand, gatewayCommandsAvailable } = await import("./hermes-gateway");
    expect(await gatewayCommandsAvailable(null)).toEqual({ available: true });
    const result = await execSlashCommand(null, "S1", "/usage");
    expect(result).toEqual({ type: "exec", output: "**Tokens:** 12" });
    expect(seen.headers?.["sec-websocket-protocol"]).toBe("hermes-gateway-v1, hermes-gateway-ticket.T123");
    expect(seen.headers?.origin).toBeUndefined();
    expect(seen.rpc).toEqual({ jsonrpc: "2.0", id: 1, method: "slash.exec", params: { session_id: "S1", command: "/usage" } });
    expect(seen.control.at(-1)).toEqual({ protocol: 1, id: 1, verb: "session-ticket", params: { profile_id: "P1", instance_id: "I1", purpose: "interactive" } });
  });
  it("relays a refusal with its reason and detail", async () => {
    reply = { jsonrpc: "2.0", id: 1, error: { code: 4001, message: "unsupported_command", data: { reason: "unsupported_command", detail: "use the CLI" } } };
    const { execSlashCommand, GatewayCommandError } = await import("./hermes-gateway");
    const err = await execSlashCommand(null, "S1", "/restart").catch((e) => e);
    expect(err).toBeInstanceOf(GatewayCommandError);
    expect(err.reason).toBe("unsupported_command");
    expect(err.detail).toBe("use the CLI");
  });
  it("passes a send directive through", async () => {
    reply = { jsonrpc: "2.0", id: 1, result: { type: "send", message: "Plan this", display: "/plan x", notice: null } };
    const { execSlashCommand } = await import("./hermes-gateway");
    expect(await execSlashCommand(null, "S1", "/plan x")).toEqual({ type: "send", message: "Plan this", display: "/plan x", notice: null });
  });
});
