import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { HERMES_HOME, profileDir } from "./hermes";

/* Slash commands, run by the gateway itself.
 *
 * :8642 routes none of them — api_server never imports the slash handler —
 * so they go where Hermes' own clients send them: `slash.exec`, a JSON-RPC
 * method on the gateway's session-authority WebSocket (`/api/ws`, served by
 * gateway/run_api.py on a loopback port the OS picks). That is a second
 * upstream transport beside :8642, and it is used for this one thing.
 *
 * Getting in is two steps, both mirrored from hermes_cli/gateway_client.py:
 *
 *   1. The control socket, `<home>/gateway.sock` (or the path a
 *      `gateway.sock.path` pointer names). `identify` says whether the owner
 *      is ready, where `/api/ws` is, and which profiles it serves;
 *      `session-ticket` mints a single-use ticket bound to one profile, valid
 *      for 30s. The socket is owner-only and checks the peer's uid, so this
 *      works only when this app runs as the gateway's user — which it does,
 *      for the same reason it can read profile keys and cron output.
 *   2. The WebSocket, with subprotocols `hermes-gateway-v1` and
 *      `hermes-gateway-ticket.<ticket>`, and no Origin header — any Origin
 *      disqualifies the ticket path, and Node's WebSocket sends none.
 *
 * A connection is opened per command and closed after it. A ticket is
 * single-use anyway, and closing the socket never ends a session.
 *
 * Under session authority `slash.exec` takes the stored session id directly
 * and is an allowlist (gateway/session_commands.py): anything else comes
 * back as `unsupported_command`, often with a hint in `data.detail`. That
 * includes /restart, /compress and /undo, which are not offered to any
 * gateway client — a refusal is relayed, never papered over. */

const PROTOCOL = "hermes-gateway-v1";
const TICKET_PREFIX = "hermes-gateway-ticket.";
const CONTROL_TIMEOUT_MS = 5_000;
const CONNECT_TIMEOUT_MS = 10_000;
/* Most commands answer at once. The ones that fork the agent (/refine,
 * /review) or upload (/debug) take longer; the CLI's own budget is 30s. */
const RPC_TIMEOUT_MS = 60_000;

export class GatewayUnavailableError extends Error {
  constructor(public reason: string, message: string) {
    super(message);
    this.name = "GatewayUnavailableError";
  }
}

/** A refusal from the gateway, as distinct from failing to reach it. */
export class GatewayCommandError extends Error {
  constructor(
    public reason: string,
    message: string,
    public detail: string | null,
  ) {
    super(message);
    this.name = "GatewayCommandError";
  }
}

/** What `slash.exec` answers under session authority. */
export type SlashResult =
  | { type: "exec"; output: string }
  /** the command rewrote itself into a prompt for the client to submit */
  | { type: "send"; message: string; display: string | null; notice: string | null };

interface Endpoint {
  apiOrigin: string;
  instanceId: string;
  profileId: string;
}

function canonical(home: string): string {
  try {
    return fs.realpathSync(home);
  } catch {
    return path.resolve(home);
  }
}

function controlSocketPath(home: string): string | null {
  const direct = path.join(home, "gateway.sock");
  if (fs.existsSync(direct)) return direct;
  try {
    const target = fs.readFileSync(path.join(home, "gateway.sock.path"), "utf8").replace(/^﻿/, "").trim();
    if (target && fs.existsSync(target)) return target;
  } catch {
    // no pointer: nothing is listening for this home
  }
  return null;
}

/** One newline-delimited request on the control socket, one reply line. */
function controlRequest(socketPath: string, request: object): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let data = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new GatewayUnavailableError("control_timeout", "The gateway's control socket did not answer"));
    }, CONTROL_TIMEOUT_MS);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
    socket.on("data", (chunk: string) => {
      data += chunk;
      if (data.length > 524_288) {
        socket.destroy();
        clearTimeout(timer);
        reject(new GatewayUnavailableError("oversized_control_response", "The gateway's reply was too large"));
        return;
      }
      const newline = data.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timer);
      socket.end();
      try {
        const reply = JSON.parse(data.slice(0, newline)) as Record<string, unknown>;
        if (reply.ok !== true || reply.protocol !== 1 || typeof reply.result !== "object" || !reply.result) {
          const error = reply.error as { reason?: string; message?: string } | undefined;
          reject(
            new GatewayUnavailableError(
              error?.reason ?? "invalid_control_response",
              error?.message ?? "The gateway refused the control request",
            ),
          );
          return;
        }
        resolve(reply.result as Record<string, unknown>);
      } catch {
        reject(new GatewayUnavailableError("invalid_control_response", "The gateway's reply was not JSON"));
      }
    });
    socket.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new GatewayUnavailableError(
          err.code === "EACCES" ? "unsafe_control_peer" : "control_unreachable",
          err.code === "EACCES"
            ? "This app is not running as the gateway's user, so it cannot use the gateway's control socket"
            : "The gateway is not running",
        ),
      );
    });
  });
}

/**
 * Finds the owner serving `profile`. A Bot's profile is usually served by
 * the root gateway (the multiplexer), whose socket mints tickets for it; one
 * running standalone has a socket of its own, which is tried first.
 */
async function discover(profile: string | null): Promise<{ endpoint: Endpoint; socketPath: string }> {
  const wanted = canonical(profileDir(profile));
  const homes = profile ? [profileDir(profile), HERMES_HOME] : [HERMES_HOME];
  let lastError: GatewayUnavailableError | null = null;

  for (const home of homes) {
    const socketPath = controlSocketPath(home);
    if (!socketPath) continue;
    let identity: Record<string, unknown>;
    try {
      identity = await controlRequest(socketPath, { protocol: 1, verb: "identify", id: 1 });
    } catch (err) {
      lastError = err instanceof GatewayUnavailableError ? err : null;
      continue;
    }

    const state = identity.state;
    if (state !== "ready") {
      lastError = new GatewayUnavailableError(
        "not_ready",
        state === "draining" ? "The gateway is restarting" : `The gateway is ${String(state ?? "not ready")}`,
      );
      continue;
    }
    const capabilities = Array.isArray(identity.capabilities) ? identity.capabilities : [];
    if (!capabilities.includes("session-authority-v1")) {
      throw new GatewayUnavailableError(
        "session_authority_unavailable",
        "This gateway does not run commands for other clients (no session authority)",
      );
    }
    const served = Array.isArray(identity.served_profiles) ? identity.served_profiles : [];
    const match = served.find(
      (entry): entry is { home: string; profile_id: string } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { home?: unknown }).home === "string" &&
        typeof (entry as { profile_id?: unknown }).profile_id === "string" &&
        canonical((entry as { home: string }).home) === wanted,
    );
    if (!match) {
      lastError = new GatewayUnavailableError("profile_mismatch", "This gateway does not serve that profile");
      continue;
    }
    const origin = identity.api_origin;
    const instanceId = identity.instance_id;
    if (typeof origin !== "string" || typeof instanceId !== "string") {
      throw new GatewayUnavailableError("invalid_runtime_identity", "The gateway did not say where its API is");
    }
    const parsed = new URL(origin);
    if (!["127.0.0.1", "::1", "[::1]", "localhost"].includes(parsed.hostname) || !parsed.port) {
      throw new GatewayUnavailableError("invalid_api_origin", "The gateway's API is not on loopback");
    }
    return { endpoint: { apiOrigin: origin, instanceId, profileId: match.profile_id }, socketPath };
  }

  throw (
    lastError ??
    new GatewayUnavailableError(
      "control_unreachable",
      "The gateway is not running, or not on this machine",
    )
  );
}

async function ticket(socketPath: string, endpoint: Endpoint): Promise<string> {
  const grant = await controlRequest(socketPath, {
    protocol: 1,
    id: 1,
    verb: "session-ticket",
    params: { profile_id: endpoint.profileId, instance_id: endpoint.instanceId, purpose: "interactive" },
  });
  if (
    grant.profile_id !== endpoint.profileId ||
    grant.instance_id !== endpoint.instanceId ||
    typeof grant.ticket !== "string" ||
    !grant.ticket
  ) {
    throw new GatewayUnavailableError("identity_changed", "The gateway restarted mid-request; try again");
  }
  return grant.ticket;
}

/** Opens the WebSocket, sends one request, and resolves with its result. */
function rpcOnce(
  endpoint: Endpoint,
  grant: string,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const url = endpoint.apiOrigin.replace(/^http/, "ws") + "/api/ws";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, [PROTOCOL, TICKET_PREFIX + grant]);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(rpcTimer);
      fn();
      try {
        ws.close();
      } catch {
        // already closing
      }
    };
    const connectTimer = setTimeout(
      () => finish(() => reject(new GatewayUnavailableError("connect_timeout", "The gateway did not accept the connection"))),
      CONNECT_TIMEOUT_MS,
    );
    let rpcTimer: ReturnType<typeof setTimeout> | undefined;

    ws.addEventListener("open", () => {
      clearTimeout(connectTimer);
      if (ws.protocol !== PROTOCOL) {
        finish(() => reject(new GatewayUnavailableError("protocol_mismatch", "The gateway speaks a different protocol")));
        return;
      }
      rpcTimer = setTimeout(
        () => finish(() => reject(new GatewayUnavailableError("rpc_timeout", "The gateway did not answer in time"))),
        RPC_TIMEOUT_MS,
      );
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
    });

    ws.addEventListener("message", (event) => {
      let frame: { id?: unknown; result?: unknown; error?: { message?: string; data?: { reason?: string; detail?: string } } };
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }
      // Pushed events (gateway.ready, session frames) carry no id.
      if (frame.id !== 1) return;
      if (frame.error) {
        const reason = frame.error.data?.reason ?? "refused";
        finish(() =>
          reject(
            new GatewayCommandError(reason, frame.error?.message ?? reason, frame.error?.data?.detail ?? null),
          ),
        );
        return;
      }
      finish(() => resolve(frame.result));
    });

    ws.addEventListener("close", (event) => {
      finish(() =>
        reject(
          new GatewayUnavailableError(
            event.code === 1013 ? "not_ready" : "closed",
            event.code === 1013 ? "The gateway is restarting" : "The gateway closed the connection",
          ),
        ),
      );
    });
    ws.addEventListener("error", () => {
      finish(() => reject(new GatewayUnavailableError("connect_failed", "Could not reach the gateway's command socket")));
    });
  });
}

/** Whether commands can run at all — for the menu, which offers them only then. */
export async function gatewayCommandsAvailable(
  profile: string | null,
): Promise<{ available: true } | { available: false; reason: string; message: string }> {
  try {
    await discover(profile);
    return { available: true };
  } catch (err) {
    if (err instanceof GatewayUnavailableError) {
      return { available: false, reason: err.reason, message: err.message };
    }
    return { available: false, reason: "error", message: "Could not reach the gateway" };
  }
}

/** Runs one slash command against a stored Hermes session. */
export async function execSlashCommand(
  profile: string | null,
  sessionId: string,
  command: string,
): Promise<SlashResult> {
  const { endpoint, socketPath } = await discover(profile);
  const grant = await ticket(socketPath, endpoint);
  const raw = (await rpcOnce(endpoint, grant, "slash.exec", {
    session_id: sessionId,
    command,
  })) as Record<string, unknown> | null;

  if (raw?.type === "send" && typeof raw.message === "string") {
    return {
      type: "send",
      message: raw.message,
      display: typeof raw.display === "string" ? raw.display : null,
      notice: typeof raw.notice === "string" ? raw.notice : null,
    };
  }
  const output = typeof raw?.output === "string" ? raw.output : "";
  return { type: "exec", output };
}
