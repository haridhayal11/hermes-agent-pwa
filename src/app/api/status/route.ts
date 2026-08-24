import { hermes } from "@/lib/hermes";
import { db } from "@/lib/db";

// Live proxy: never cached. Without this Next prerenders a zero-argument
// GET handler at build time and serves the snapshot forever.
export const dynamic = "force-dynamic";


export async function GET() {
  const [health, capabilities] = await Promise.allSettled([
    hermes.health(),
    hermes.capabilities(),
  ]);

  const activeRuns = db
    .prepare(
      `SELECT run_id, project_id, status, started_at FROM runs
       WHERE status IN ('queued', 'running', 'waiting_for_approval')
       ORDER BY started_at DESC`,
    )
    .all();

  return Response.json({
    hermes: {
      reachable: health.status === "fulfilled",
      health: health.status === "fulfilled" ? health.value : null,
      capabilities: capabilities.status === "fulfilled" ? capabilities.value : null,
      error: health.status === "rejected" ? String(health.reason) : null,
    },
    active_runs: activeRuns,
  });
}
