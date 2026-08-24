"use client";

/* An iPhone photo is 3–5MB and 4032px on the long edge. Sent whole it would be
 * base64'd into the run's input — a third larger again — for no gain: the
 * model doesn't see more than about 1568px, and the tailnet round trip is the
 * slowest part of sending. So resize in the browser before uploading.
 *
 * createImageBitmap + canvas rather than a library: both are available in
 * every browser this app supports (Safari 16.4 is the floor). HEIC from an
 * iPhone arrives already transcoded to JPEG by the file picker. */

const MAX_EDGE = 1568;
const QUALITY = 0.82;

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // SVG is vector — rasterising it would be a downgrade, not a saving.
  if (file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    // Unsupported codec, or a canvas the browser refuses to read back. The
    // original still uploads; it is only bigger.
    return file;
  }
}
