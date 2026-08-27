import { createHash } from "node:crypto";
import { POST as upload } from "@/app/api/upload/route";
import { error, fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentDigest } from "@/lib/api/v1/idempotency";

export async function POST(request: Request) {
  return withDevice(request, async (device) => {
    const supplied = request.headers.get("x-content-sha256")?.toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(supplied)) {
      return error(
        400,
        "invalid_digest",
        "X-Content-SHA256 must contain the file's lowercase SHA-256 digest.",
      );
    }
    const form = await request.clone().formData().catch(() => null);
    const file = form?.get("file");
    const projectId = String(form?.get("projectId") ?? "");
    if (!(file instanceof File)) {
      return error(400, "invalid_request", "A multipart file is required.");
    }
    const actual = createHash("sha256")
      .update(Buffer.from(await file.arrayBuffer()))
      .digest("hex");
    if (actual !== supplied) {
      return error(400, "digest_mismatch", "The uploaded bytes do not match the digest.");
    }
    return idempotentDigest(
      request,
      device.id,
      "POST:/api/v1/uploads",
      supplied,
      `${projectId}\n${file.name}\n${file.type}\n${file.size}`,
      async () => fromLegacy(await upload(request)),
    );
  });
}
