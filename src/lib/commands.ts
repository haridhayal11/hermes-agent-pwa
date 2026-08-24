/* The `/` menu.
 *
 * Hermes keeps a single registry — `COMMAND_REGISTRY` in
 * `hermes_cli/commands.py` — and cuts two menus out of it: the CLI's, and the
 * messaging gateway's. The gateway cut is what `telegram_bot_commands()` hands
 * to Telegram's `setMyCommands`: every entry whose `cli_only` flag is unset.
 *
 * This file mirrors the **Telegram** cut, because a phone is a messaging
 * surface and not a terminal — `/skin`, `/palette`, `/copy`, `/tools` and
 * `/quit` mean nothing here, and Telegram doesn't list them either. Checked
 * against 0.20.5 on home-laptop: 63 entries, one of which (`/hermes_live`) is
 * plugin-registered and therefore per-install, so it isn't hardcoded here.
 *
 * Hermes **routes none of them over :8642**: api_server.py never imports
 * gateway/slash_commands.py, so "/model gpt-5" sent to /v1/runs arrives at the
 * model as literal text. There is no endpoint serving the catalogue either —
 * it lives in the CLI process, not the API server.
 *
 * So this file is two things:
 *
 *   1. DISPATCH — the commands this app carries out itself, each mapped to an
 *      endpoint it already owns. These are the only ones that do anything.
 *   2. CATALOGUE — the rest of Telegram's menu, listed with Hermes' own
 *      description and why it isn't actionable here. Listing them is the
 *      point: a menu that showed twelve entries would imply Hermes has twelve
 *      commands.
 *
 * Names, descriptions and argument hints are verbatim from `COMMAND_REGISTRY`
 * so the two surfaces read the same.
 *
 * Before moving anything from CATALOGUE to DISPATCH, check the route table on
 * the running instance. `/api/jobs` is now wired — Settings → Scheduled is the
 * whole CRUD — but `/cron` still isn't here, and shouldn't be: it is `cli_only`
 * upstream, so Telegram doesn't list it, and this file mirrors Telegram's cut.
 */

export type CommandId =
  | "model"
  | "steer"
  | "queue"
  | "stop"
  | "retry"
  | "new"
  | "branch"
  | "title"
  | "skills"
  | "toolsets"
  | "status"
  | "search";

export type CommandCategory =
  | "Session"
  | "Configuration"
  | "Tools & Skills"
  | "Info";

export interface SlashCommand {
  name: string;
  /** other spellings Hermes accepts for the same thing */
  aliases?: string[];
  /** Hermes' own one-liner, verbatim from COMMAND_REGISTRY */
  description: string;
  args?: string;
  category: CommandCategory;
  id: CommandId;
  /** true when the command consumes the rest of the line as its argument */
  takesText?: boolean;
  /**
   * Capability from /v1/capabilities that has to be advertised for this to
   * appear. Absent means it works on any Hermes.
   */
  requires?: "run_steer" | "session_fork" | "model_options" | "toolsets" | "skills_api";
  /** hidden unless a run is in flight */
  activeRunOnly?: boolean;
}

/** Commands this app actually carries out. */
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "model",
    id: "model",
    category: "Configuration",
    description: "Switch model (session-scoped; --global to persist)",
    args: "[model]",
    requires: "model_options",
  },
  {
    name: "steer",
    id: "steer",
    category: "Session",
    description: "Inject a message after the next tool call without interrupting",
    args: "<prompt>",
    takesText: true,
    requires: "run_steer",
    activeRunOnly: true,
  },
  {
    name: "queue",
    aliases: ["q"],
    id: "queue",
    category: "Session",
    description: "Queue a prompt for the next turn (doesn't interrupt)",
    args: "<prompt>",
    takesText: true,
    activeRunOnly: true,
  },
  {
    name: "stop",
    id: "stop",
    category: "Session",
    description: "Kill all running background processes",
    activeRunOnly: true,
  },
  {
    name: "retry",
    id: "retry",
    category: "Session",
    description: "Retry the last message (resend to agent)",
  },
  {
    name: "new",
    aliases: ["reset", "clear"],
    id: "new",
    category: "Session",
    description: "Start a new session (fresh session ID + history)",
    args: "[name]",
  },
  {
    name: "branch",
    aliases: ["fork"],
    id: "branch",
    category: "Session",
    description: "Branch the current session (explore a different path)",
    args: "[name]",
    takesText: true,
    requires: "session_fork",
  },
  {
    name: "title",
    id: "title",
    category: "Session",
    description: "Set a title for the current session",
    args: "[name]",
    takesText: true,
  },
  {
    name: "status",
    id: "status",
    category: "Session",
    description: "Show session, model, token, and context info",
  },
  {
    // `cli_only` in Hermes, so Telegram never shows it — but /v1/skills is a
    // real endpoint and this app has a picker for it.
    name: "skills",
    id: "skills",
    category: "Tools & Skills",
    description: "Search, install, inspect, or manage skills",
    requires: "skills_api",
  },
  {
    // Also `cli_only` upstream; /v1/toolsets serves it.
    name: "toolsets",
    id: "toolsets",
    category: "Tools & Skills",
    description: "List available toolsets",
    requires: "toolsets",
  },
  {
    // Not a Hermes command. Ours: cross-project search over our own SQLite,
    // since Hermes has no search endpoint and message bodies live there.
    name: "search",
    id: "search",
    category: "Info",
    description: "Search project names, instructions and prompts (this app only)",
  },
];

/**
 * Why a catalogued command isn't actionable here.
 *
 *   "no-api"    — nothing on :8642 exposes the state it reads or writes.
 *   "unbuilt"   — an endpoint does exist; this app just hasn't wired a UI to
 *                 it yet. These are the honest candidates for promotion.
 */
export type CatalogueReason = "no-api" | "unbuilt";

export interface CatalogueCommand {
  name: string;
  aliases?: string[];
  args?: string;
  description: string;
  category: CommandCategory;
  reason: CatalogueReason;
  /** where the capability actually lives in this app, when it does */
  note?: string;
}

/**
 * The rest of Telegram's `/` menu — `COMMAND_REGISTRY` minus `cli_only`, minus
 * the entries SLASH_COMMANDS already dispatches. Ordered as the registry
 * orders them.
 */
export const COMMAND_CATALOGUE: CatalogueCommand[] = [
  // ---- Session -----------------------------------------------------------
  { name: "/start", description: "Acknowledge platform start pings without a reply", category: "Session", reason: "no-api", note: "a handshake for chat platforms; there's nothing to acknowledge here" },
  { name: "/topic", args: "[off|help|session-id]", description: "Enable or inspect Telegram DM topic sessions", category: "Session", reason: "no-api", note: "one project is one topic here" },
  { name: "/save", args: "<json|md|html> [filename] [redact]", description: "Export the current conversation (bare /save shows usage)", category: "Session", reason: "unbuilt", note: "would be exported here from the loaded transcript" },
  { name: "/undo", args: "[N]", description: "Back up N user turns and re-prompt (default 1)", category: "Session", reason: "no-api" },
  { name: "/compress", aliases: ["compact"], args: "[here [N] | focus topic | --preview]", description: "Compress conversation context (add 'here [N]' to keep recent N turns; --preview shows what would happen)", category: "Session", reason: "no-api", note: "Hermes compacts in place on its own, which is what keeps the session id" },
  { name: "/rollback", args: "[number] [--all]", description: "List or restore filesystem checkpoints (restores keep your hand-edits; --all overrides)", category: "Session", reason: "no-api" },
  { name: "/pause", args: "[reason | off]", description: "Pause new work globally (emergency stop); '/pause off' resumes", category: "Session", reason: "no-api", note: "/stop cancels this run" },
  { name: "/approve", args: "[session|always]", description: "Approve a pending dangerous command", category: "Session", reason: "unbuilt", note: "the approval card does this when one is pending" },
  { name: "/deny", args: "[all] [reason]", description: "Deny a pending dangerous command (optionally with a reason)", category: "Session", reason: "unbuilt", note: "the approval card does this when one is pending" },
  { name: "/background", aliases: ["bg", "btw"], args: "<prompt>", description: "Run a prompt in the background", category: "Session", reason: "no-api" },
  { name: "/agents", aliases: ["tasks"], description: "Show active agents and running tasks", category: "Session", reason: "no-api", note: "subagent cards show this run's delegates" },
  { name: "/goal", args: "[text | show | pause | clear | status]", description: "Set a standing goal Hermes works on across turns until achieved", category: "Session", reason: "no-api", note: "project instructions are the durable equivalent" },
  { name: "/heartbeat", aliases: ["hb"], args: "[every <interval> <prompt> | status | clear]", description: "Set a recurring prompt that re-enters this session when idle", category: "Session", reason: "no-api" },
  { name: "/refine", args: "[focus instructions]", description: "Review this conversation now and save lessons to memory/skills", category: "Session", reason: "no-api" },
  { name: "/loop", aliases: ["proactive"], args: "[interval] <prompt> [--times N] | status | stop", description: "Re-run a prompt on a recurring interval in this session", category: "Session", reason: "no-api", note: "Settings → Scheduled runs /api/jobs, but a cron job is its own session, not a loop inside this one" },
  { name: "/moa", args: "<prompt>", description: "Run one prompt through the default Mixture of Agents preset, then restore your model", category: "Session", reason: "unbuilt", note: "the moa provider is selectable in the model picker" },
  { name: "/subgoal", args: "[text | remove N | clear]", description: "Add or manage extra criteria on the active goal", category: "Session", reason: "no-api" },
  { name: "/egress", args: "[status]", description: "Show Docker egress proxy status", category: "Session", reason: "no-api" },
  { name: "/context", aliases: ["ctx"], args: "[all]", description: "Show detailed context window view with usage gauge, category breakdown, compression stats, and throughput", category: "Session", reason: "no-api" },
  { name: "/sethome", aliases: ["set-home"], description: "Set this chat as the home channel", category: "Session", reason: "no-api" },
  { name: "/resume", args: "[name]", description: "Resume a previously-named session", category: "Session", reason: "unbuilt", note: "GET /api/sessions exists; the project rail is the current answer" },
  { name: "/sessions", description: "Browse and resume previous sessions", category: "Session", reason: "unbuilt", note: "GET /api/sessions exists; the project rail is the current answer" },
  { name: "/restart", description: "Gracefully restart the gateway after draining active runs", category: "Session", reason: "no-api" },

  // ---- Configuration -----------------------------------------------------
  { name: "/codex-runtime", aliases: ["codex_runtime"], args: "[auto|codex_app_server]", description: "Toggle codex app-server runtime for OpenAI/Codex models", category: "Configuration", reason: "no-api" },
  { name: "/personality", args: "[name]", description: "Set a predefined personality", category: "Configuration", reason: "no-api", note: "project instructions do this per project" },
  { name: "/footer", args: "[on|off|status]", description: "Toggle gateway runtime-metadata footer on final replies", category: "Configuration", reason: "no-api" },
  { name: "/yolo", description: "Toggle YOLO mode (skip all dangerous command approvals)", category: "Configuration", reason: "no-api" },
  { name: "/approvals", args: "[manual|smart|off]", description: "Show or set the persistent dangerous-command approval mode", category: "Configuration", reason: "no-api" },
  { name: "/reasoning", args: "[level|show|hide|full|clamp] [--global]", description: "Manage reasoning effort and display", category: "Configuration", reason: "unbuilt", note: "the thinking chip sets reasoning effort per project" },
  { name: "/fast", args: "[normal|fast|status] [--global]", description: "Toggle fast mode — OpenAI Priority Processing / Anthropic Fast Mode (Normal/Fast)", category: "Configuration", reason: "unbuilt", note: "the model picker sets model_options.fast per project" },
  { name: "/voice", args: "[on|off|tts|status]", description: "Toggle voice mode", category: "Configuration", reason: "no-api", note: "capabilities reports audio_api and realtime_voice as false" },

  // ---- Tools & Skills ----------------------------------------------------
  { name: "/memory", args: "[pending|approve|reject|approval] [id|on|off]", description: "Review pending memory writes / toggle the approval gate", category: "Tools & Skills", reason: "no-api", note: "capabilities reports memory_write_api as false" },
  { name: "/bundles", description: "List skill bundles (aliases /<name> for multiple skills)", category: "Tools & Skills", reason: "no-api" },
  { name: "/learn", args: "<what to learn from>", description: "Learn a reusable skill from anything you describe (dirs, URLs, this chat, notes)", category: "Tools & Skills", reason: "no-api", note: "ask the agent in prose" },
  { name: "/init", args: "[notes]", description: "Generate or update AGENTS.md project instructions from a repo scan", category: "Tools & Skills", reason: "no-api", note: "ask the agent in prose" },
  { name: "/suggestions", aliases: ["suggest"], args: "[accept|dismiss N | catalog]", description: "Review suggested automations (accept/dismiss)", category: "Tools & Skills", reason: "no-api" },
  { name: "/blueprint", aliases: ["bp"], args: "[name] [slot=value ...]", description: "Set up an automation from a blueprint template", category: "Tools & Skills", reason: "no-api" },
  { name: "/curator", args: "[subcommand]", description: "Background skill maintenance (status, run, pin, archive, list-archived)", category: "Tools & Skills", reason: "no-api" },
  { name: "/kanban", args: "[subcommand]", description: "Multi-profile collaboration board (tasks, links, comments)", category: "Tools & Skills", reason: "no-api" },
  { name: "/reload-mcp", aliases: ["reload_mcp"], description: "Reload MCP servers from config", category: "Tools & Skills", reason: "no-api" },
  { name: "/reload-skills", aliases: ["reload_skills"], description: "Re-scan ~/.hermes/skills/ for newly installed or removed skills", category: "Tools & Skills", reason: "no-api" },

  // ---- Info --------------------------------------------------------------
  { name: "/whoami", description: "Show your slash command access (admin / user)", category: "Info", reason: "no-api" },
  { name: "/profile", description: "Show active profile name and home directory", category: "Info", reason: "no-api" },
  { name: "/diff", args: "[staged|all|session] [--stat] [path...]", description: "Show git changes in the working directory", category: "Info", reason: "no-api", note: "ask the agent — it has the terminal tool" },
  { name: "/commands", args: "[page]", description: "Browse all commands and skills (paginated)", category: "Info", reason: "no-api", note: "this menu is it" },
  { name: "/help", args: "[skills|<filter>]", description: "Show available commands (/help skills lists skill commands, /help <text> filters)", category: "Info", reason: "no-api", note: "this menu is it" },
  { name: "/usage", args: "[reset [--force]]", description: "Show token usage and rate limits; `reset` redeems a banked Codex limit reset", category: "Info", reason: "unbuilt", note: "run.completed and /api/sessions both carry token counts" },
  { name: "/topup", description: "Show your Nous balance and manage billing on the portal", category: "Info", reason: "no-api" },
  { name: "/insights", args: "[days]", description: "Show usage insights and analytics", category: "Info", reason: "no-api" },
  { name: "/platform", args: "<pause|resume|list> [name]", description: "Pause, resume, or list a failing gateway platform", category: "Info", reason: "no-api" },
  { name: "/update", description: "Update Hermes Agent to the latest version", category: "Info", reason: "no-api" },
  { name: "/version", aliases: ["v"], description: "Show Hermes Agent version", category: "Info", reason: "unbuilt", note: "/health returns it; shown in Settings → Connection" },
  { name: "/debug", args: "[nous|local]", description: "Upload debug report (system info + logs) and get shareable links", category: "Info", reason: "no-api" },
];

export const REASON_LABEL: Record<CatalogueReason, string> = {
  "no-api": "no endpoint",
  unbuilt: "not wired up",
};

export const UNROUTED_REASON =
  "This is the menu Hermes gives Telegram — its whole gateway command set — and :8642 routes none of it: api_server never imports the gateway's slash handler, and no endpoint serves the catalogue. The greyed entries are listed with what stands in for them here.";

export interface ParsedCommand {
  command: SlashCommand;
  /** everything after the command word, trimmed */
  rest: string;
}

/** Resolves "/fork my branch" to the branch command plus "my branch". */
export function parseCommand(draft: string): ParsedCommand | null {
  if (!draft.startsWith("/")) return null;
  const match = /^\/([a-z_-]+)\s*([\s\S]*)$/i.exec(draft);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const command = SLASH_COMMANDS.find(
    (c) => c.name === word || c.aliases?.includes(word),
  );
  return command ? { command, rest: match[2].trim() } : null;
}

/** True when the word is a real Hermes command we simply can't run. */
export function findCatalogued(word: string): CatalogueCommand | undefined {
  const bare = word.replace(/^\//, "").toLowerCase();
  return COMMAND_CATALOGUE.find(
    (c) => c.name.slice(1) === bare || c.aliases?.includes(bare),
  );
}

/** The token being typed after a leading "/", or null when that isn't what's happening. */
export function commandQuery(draft: string, caret: number): string | null {
  if (!draft.startsWith("/")) return null;
  const upToCaret = draft.slice(0, caret);
  // Once there's whitespace the user is writing the argument, not choosing a
  // command — the menu gets out of the way.
  if (/\s/.test(upToCaret)) return null;
  return upToCaret.slice(1).toLowerCase();
}

/**
 * The `@` token being typed, or null. Anchored to a word boundary so an email
 * address or a "user@host" path doesn't open the menu mid-word.
 */
export function mentionQuery(draft: string, caret: number): { query: string; start: number } | null {
  const upToCaret = draft.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upToCaret[at - 1])) return null;
  const query = upToCaret.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { query: query.toLowerCase(), start: at };
}
