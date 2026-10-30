import { getActivity } from "@/lib/activity";

// Zero-argument GET: without this Next prerenders it and serves the build's
// snapshot forever (CLAUDE.md, "Key invariants").
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getActivity());
}
