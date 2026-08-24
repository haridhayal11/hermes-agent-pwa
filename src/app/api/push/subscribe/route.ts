import {
  deleteSubscription,
  pushConfigured,
  saveSubscription,
  setSubscriptionKinds,
  subscriptionKinds,
  PUSH_KINDS,
  type PushKind,
} from "@/lib/push";

// Never prerendered: it reads a query parameter, but the whole file is a live
// view of what the server thinks this device is subscribed to.
export const dynamic = "force-dynamic";

/** This device's switches, for the settings screen to render. */
export async function GET(request: Request) {
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) {
    return Response.json({ error: "endpoint is required" }, { status: 400 });
  }
  return Response.json({ kinds: subscriptionKinds(endpoint) });
}

export async function POST(request: Request) {
  if (!pushConfigured) {
    return Response.json(
      { error: "VAPID keys are not configured on the server" },
      { status: 503 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: Record<string, string>;
  } | null;

  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return Response.json({ error: "invalid subscription" }, { status: 400 });
  }

  saveSubscription(
    body.endpoint,
    body.keys,
    request.headers.get("user-agent"),
  );
  // kinds_json is left NULL on insert, which reads back as "every kind" —
  // a device that has just turned notifications on has expressed no opinion
  // about which ones, and defaulting to silence would look broken.
  return Response.json({ ok: true, kinds: subscriptionKinds(body.endpoint) });
}

/**
 * Which kinds this device wants. Per device rather than per account, because
 * that is what a push subscription already is — the switches live on the row
 * they govern, so nothing has to be reconciled between a phone and a Mac.
 */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    kinds?: unknown;
  } | null;

  if (!body?.endpoint) {
    return Response.json({ error: "endpoint is required" }, { status: 400 });
  }
  if (!Array.isArray(body.kinds)) {
    return Response.json({ error: "kinds must be an array" }, { status: 400 });
  }

  const kinds = PUSH_KINDS.filter((k) => (body.kinds as unknown[]).includes(k));
  if (!setSubscriptionKinds(body.endpoint, kinds as PushKind[])) {
    // The browser thinks it is subscribed and we have no row for it — usually
    // a stale endpoint after the database was moved. Say so rather than
    // pretending the switch was saved.
    return Response.json({ error: "unknown subscription" }, { status: 404 });
  }
  return Response.json({ ok: true, kinds });
}

export async function DELETE(request: Request) {
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) {
    return Response.json({ error: "endpoint is required" }, { status: 400 });
  }
  deleteSubscription(endpoint);
  return Response.json({ ok: true });
}
