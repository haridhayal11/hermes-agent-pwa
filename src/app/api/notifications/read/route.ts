import { markAllRead } from "@/lib/activity";

/* "Mark all read" in the notifications panel. Opening a chat already marks
 * what is in it; this is for the rest. Approvals are untouched — those are
 * read by answering them. */
export async function POST() {
  return Response.json({ ok: true, marked: markAllRead() });
}
