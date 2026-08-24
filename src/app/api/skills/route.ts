import { hermes } from "@/lib/hermes";

// Live proxy: never cached. Without this Next prerenders a zero-argument
// GET handler at build time and serves the snapshot forever.
export const dynamic = "force-dynamic";


/** Skill catalogue for the project settings picker. Metadata only — Hermes
 * has no endpoint that returns a skill's body, and we don't want one: the
 * largest installed skill is ~100KB, so skills are referenced by name and
 * pulled in by the agent through skill_view when relevant. */
export async function GET() {
  try {
    const res = await hermes.skills();
    return Response.json({ skills: res.data ?? [] });
  } catch {
    // Hermes down — an empty picker is better than a broken settings sheet.
    return Response.json({ skills: [], unavailable: true });
  }
}
