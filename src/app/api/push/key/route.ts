import { publicKey, pushConfigured, subscriptionCount } from "@/lib/push";

// Live proxy: never cached. Without this Next prerenders a zero-argument
// GET handler at build time and serves the snapshot forever — which for this
// route would mean shipping "push not configured" to production permanently.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    configured: pushConfigured,
    // The VAPID *public* key is meant to be public — it is what the browser
    // passes to pushManager.subscribe(). The private key never leaves here.
    publicKey: pushConfigured ? publicKey() : null,
    subscriptions: subscriptionCount(),
  });
}
