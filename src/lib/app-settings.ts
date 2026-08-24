import { db } from "./db";
import { AGENT_NAME_MAX, APP_NAME } from "./branding";

/**
 * Install-wide settings, as opposed to the per-device ones in
 * `preferences.ts`.
 *
 * The split is the same one that governs push: `localStorage` holds what is a
 * property of the screen in front of you, and this holds what the *server* has
 * to be able to answer. The agent's name is the second kind — it goes out in
 * push payloads, which are composed in Node where no browser storage exists,
 * and an agent that answered to a different name on the phone than on the Mac
 * would be two agents.
 *
 * A key/value table rather than a column per setting: there is exactly one row
 * so far, and a schema migration per future toggle would be the wrong price.
 */

const get = db.prepare(`SELECT value FROM app_settings WHERE key = ?`);
const put = db.prepare(
  `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);

/** What the agent is called in this install. Never empty. */
export function getAgentName(): string {
  const row = get.get("agent_name") as { value: string } | undefined;
  const name = row?.value?.trim();
  return name || APP_NAME;
}

/**
 * Stores the agent's name and returns what was actually stored.
 *
 * Blank resets to the default rather than erroring: clearing the field in
 * Settings is the obvious way to ask for "whatever it was before".
 */
export function setAgentName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, AGENT_NAME_MAX);
  put.run("agent_name", name);
  return name || APP_NAME;
}
