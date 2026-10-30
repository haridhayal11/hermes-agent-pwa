/* Client half of /save and "Export chat": fetch the file the server built,
 * then hand it to the share sheet where there is one (an iPhone: Save to
 * Files, AirDrop, Mail) and download it everywhere else. Resolves to an error
 * message, or null once the file has been handed over. */

export async function exportThread(
  projectId: string,
  sessionId: string,
  format: "md" | "json" = "md",
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(
      `/api/projects/${projectId}/sessions/${sessionId}/export?format=${format}`,
    );
  } catch {
    return "Could not reach the server to export";
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return body.error ?? "Could not export this chat";
  }
  const name =
    /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ??
    `chat.${format}`;
  const blob = await response.blob();
  const file = new File([blob], name, { type: blob.type });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return null;
    } catch (err) {
      // Dismissing the sheet is a choice, not a failure.
      if ((err as Error).name === "AbortError") return null;
      // Anything else (no user activation left after the fetch, say): fall
      // through to a plain download rather than losing the export.
    }
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}
