/**
 * The app's own name, and the slug everything durable is keyed on.
 *
 * The app is Hermes PWA and stays that way — it is what the user installed and
 * what the home screen icon says. The *agent's* name is the thing that is
 * theirs to choose, and that lives in `app-settings.ts` rather than here,
 * because it is stored per install and changes at runtime.
 */
export const APP_NAME = "Hermes";

/**
 * The stable identifier for anything durable: the `localStorage` key, the
 * default data directory, notification tags, upload folders.
 *
 * Deliberately a constant and not derived from the agent name. Those are all
 * persistent state, so a slug that moved when someone renamed their agent
 * would orphan a device's preferences and its database.
 */
export const APP_SLUG = "hermes-pwa";

/** Cap on the user-chosen agent name. Long enough for a name, short enough
 *  that it can never wrap the chat's speaker label. */
export const AGENT_NAME_MAX = 32;
