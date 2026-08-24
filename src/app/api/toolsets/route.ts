import { hermes } from "@/lib/hermes";

// Zero-argument GET — see the note in /api/models.
export const dynamic = "force-dynamic";

/**
 * GET /v1/toolsets, verbatim. This is the deterministic answer to "what can
 * this agent actually do", which otherwise costs a turn of asking the model
 * and trusting what it says.
 */
export async function GET() {
  try {
    const res = await hermes.toolsets();
    return Response.json({ toolsets: res.data ?? [] });
  } catch {
    return Response.json({ toolsets: [], unavailable: true });
  }
}
