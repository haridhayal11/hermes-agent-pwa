import { runManager } from "@/lib/run-manager";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  safeFilename,
  writeUpload,
} from "@/lib/uploads";

/**
 * POST /api/upload  (multipart/form-data: `file`, `projectId`)
 *
 * Images come back as a data: URL to be inlined in the next run's input.
 * Everything else is written next to the project and comes back as a path,
 * because Hermes rejects non-image attachments outright.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const projectId = String(form.get("projectId") ?? "");
  if (!runManager.getProject(projectId)) {
    return Response.json({ error: "unknown project" }, { status: 404 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }

  const isImage = file.type.startsWith("image/");
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (file.size > limit) {
    return Response.json(
      {
        error: `${isImage ? "Image" : "File"} is larger than ${Math.round(
          limit / (1024 * 1024),
        )}MB`,
      },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Everything lands on disk, images included. The data: URL below is what
  // Hermes needs, but it lives only in that one run's input — writing the
  // bytes down is what lets the thread show the picture again tomorrow, and
  // what lets the agent reopen it on a later turn.
  const written = writeUpload(projectId, file.name || "attachment", bytes);

  if (isImage) {
    return Response.json({
      kind: "image",
      name: safeFilename(file.name || "image"),
      // base64 inflates by a third — the composer downscales before it gets
      // here, which is what keeps this inside MAX_IMAGE_BYTES for a phone photo
      url: `data:${file.type};base64,${bytes.toString("base64")}`,
      path: written,
      size: file.size,
    });
  }

  return Response.json({
    kind: "file",
    name: safeFilename(file.name || "attachment"),
    path: written,
    size: file.size,
  });
}
