import { revokeDevice } from "@/lib/api/v1/device-auth";
import { json, withDevice } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withDevice(request, (device) => json({ device, apiVersion: 1 }));
}

export async function DELETE(request: Request) {
  return withDevice(request, (device) => {
    revokeDevice(device.id);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  });
}
