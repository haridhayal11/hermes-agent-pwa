import { authenticateDevice, type ApiDevice } from "./device-auth";

export const API_VERSION = "1";

export function json(
  body: unknown,
  init: ResponseInit & { status?: number } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Hermes-API-Version", API_VERSION);
  return Response.json(body, { ...init, headers });
}

export function error(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status },
  );
}

/** Adds the stable API headers without consuming a JSON or streaming body. */
export function versioned(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Hermes-API-Version", API_VERSION);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Converts the browser API's historical `{error: string}` into the v1 shape. */
export async function fromLegacy(response: Response): Promise<Response> {
  if (response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    return versioned(response);
  }

  const body = (await response.json().catch(() => null)) as
    | { error?: unknown }
    | null;
  const message =
    typeof body?.error === "string" ? body.error : "The request could not be completed.";
  const code =
    response.status === 400
      ? "invalid_request"
      : response.status === 404
        ? "not_found"
        : response.status === 409
          ? "conflict"
          : response.status === 413
            ? "payload_too_large"
            : response.status === 501
              ? "not_supported"
              : response.status === 502
                ? "upstream_error"
                : "request_failed";
  return error(response.status, code, message);
}

export async function withDevice(
  request: Request,
  handler: (device: ApiDevice) => Response | Promise<Response>,
): Promise<Response> {
  const device = authenticateDevice(request);
  if (!device) {
    return error(
      401,
      "invalid_credentials",
      "A valid paired-device bearer token is required.",
    );
  }

  try {
    return versioned(await handler(device));
  } catch (cause) {
    console.error("[api/v1] unhandled route error:", cause);
    return error(500, "internal_error", "The server could not complete the request.");
  }
}
