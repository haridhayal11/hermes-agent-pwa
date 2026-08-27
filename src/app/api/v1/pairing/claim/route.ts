import { claimPairingCode } from "@/lib/api/v1/device-auth";
import { error, json } from "@/lib/api/v1/http";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { code?: unknown; deviceName?: unknown; platform?: unknown }
    | null;
  const code = typeof body?.code === "string" ? body.code : "";
  const deviceName =
    typeof body?.deviceName === "string" ? body.deviceName.trim() : "";

  if (!code || !deviceName) {
    return error(400, "invalid_request", "code and deviceName are required.");
  }
  if (body?.platform !== undefined && body.platform !== "android") {
    return error(400, "invalid_request", "platform must be android.");
  }
  if (deviceName.length > 80) {
    return error(400, "invalid_request", "deviceName must be 80 characters or fewer.");
  }

  const claimed = claimPairingCode(code, deviceName, "android");
  if (!claimed.ok) {
    return error(401, "invalid_pairing_code", "The pairing code is invalid or expired.");
  }

  return json(
    {
      device: claimed.device,
      credentials: {
        scheme: "Bearer",
        accessToken: claimed.accessToken,
      },
      apiVersion: 1,
    },
    { status: 201 },
  );
}
