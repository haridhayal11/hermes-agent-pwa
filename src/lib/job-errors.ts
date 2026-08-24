import { HermesApiError } from "./hermes";

/* Translating Hermes' cron errors into something a form can show.
 *
 * `/api/jobs` does not use the OpenAI-shaped envelope the `/v1/*` routes do —
 * it answers a plain `{"error": "..."}` — and it gets two status codes wrong
 * in ways the UI would otherwise inherit. */

/** Job ids are `uuid4().hex[:12]`; anything else is rejected before the handler. */
export const JOB_ID_RE = /^[a-f0-9]{12}$/;

function messageOf(err: HermesApiError): string {
  const body = err.body;
  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error?: unknown }).error;
    if (typeof value === "string" && value) return value;
  }
  return typeof body === "string" && body ? body : `Hermes ${err.status}`;
}

/**
 * A typo in the schedule field arrives as a 500.
 *
 * `parse_schedule` raises ValueError and the create/update handlers wrap
 * everything in one try/except, so "every fortnight-ish" is reported the same
 * way a database fault would be. Rewriting these to 400 is what lets the sheet
 * show the message inline instead of "server error".
 *
 * The five messages it can raise, verified in `cron/jobs.py` on 0.20.5 —
 * `Invalid duration` is the one that escapes from `parse_duration` before the
 * catch-all `Invalid schedule` is ever reached, which is what a mistyped
 * "every …" produces.
 */
const SCHEDULE_FAULTS =
  /invalid (?:cron expression|timestamp|schedule|duration)|cron expressions require/i;

export function jobErrorResponse(err: unknown): Response {
  if (!(err instanceof HermesApiError)) {
    return Response.json(
      { error: err instanceof Error ? err.message : "job request failed" },
      { status: 502 },
    );
  }

  const message = messageOf(err);

  // No cron module on this gateway at all. Every handler checks for it, so
  // this is the honest feature probe — /v1/capabilities reports
  // `jobs_admin: false` unconditionally and omits /api/jobs from its endpoint
  // map, which makes it useless for gating.
  if (err.status === 501) {
    return Response.json({ error: message, unavailable: true }, { status: 501 });
  }
  if (err.status === 500 && SCHEDULE_FAULTS.test(message)) {
    return Response.json({ error: message }, { status: 400 });
  }
  if (err.status === 400 || err.status === 404 || err.status === 424) {
    return Response.json({ error: message }, { status: err.status });
  }
  return Response.json({ error: message }, { status: 502 });
}

/** True when Hermes has no cron module — the list route degrades instead of failing. */
export function isCronUnavailable(err: unknown): boolean {
  return err instanceof HermesApiError && err.status === 501;
}
