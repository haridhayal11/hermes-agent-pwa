/* The running gateway's version, wherever it chooses to say it.
 *
 * Nothing in the API contract pins this: `/health` and `/v1/capabilities`
 * are both free-form, and builds differ in which (if either) carries it. So
 * this looks in the places a version plausibly lives and reports nothing
 * rather than guessing. It is for display — `/version` and Settings — and
 * never for gating; features are decided by capabilities, not by version. */

const KEYS = ["version", "hermes_version", "agent_version", "server_version"];

function find(source: unknown, depth = 0): string | null {
  if (!source || typeof source !== "object" || depth > 1) return null;
  const record = source as Record<string, unknown>;
  for (const key of KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const nested of ["server", "hermes", "agent", "build"]) {
    const found = find(record[nested], depth + 1);
    if (found) return found;
  }
  return null;
}

export function hermesVersion(health: unknown, capabilities: unknown): string | null {
  return find(health) ?? find(capabilities);
}
