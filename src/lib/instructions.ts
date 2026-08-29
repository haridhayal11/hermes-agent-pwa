import { RECOMMEND_FENCE } from "./chat-types";

// A project's persistent framing.
//
// The manual way to do this in a chat client is to pin a seed message. That is
// a display-layer trick: the model only sees it while that turn is still in the
// context window, and once compaction fires it survives as whatever the
// summarizer happened to keep.
//
// Instead we keep the framing here and pass it as `instructions` (Hermes'
// ephemeral system prompt) on every single run, so turn 500 is framed exactly
// like turn 1 at zero transcript cost.
//
// Two Hermes constraints shape this (both verified in api_server.py):
//   - Slash commands are not routed on :8642 — api_server never imports
//     gateway/slash_commands.py, so `/skill foo` would reach the model as
//     literal text. Skills have to be named in prose instead. The composer's
//     `@` menu inserts a backticked skill name for the same reason.
//   - There is no per-request working directory — _create_agent takes no cwd
//     parameter, so `.hermes.md` / AGENTS.md discovery always resolves against
//     the gateway's own cwd. A project's directory has to be stated in text.

export interface ProjectInstructionInput {
  name: string;
  /**
   * Absolute path to this project's outbox. Passed in rather than derived:
   * PROJECT_TEMPLATES puts this module in the client bundle, and working the
   * path out needs node:path and the database.
   */
  outboxDir: string;
  instructions?: string | null;
  cwd?: string | null;
  /** Hermes skill names linked to this project. */
  skills?: string[] | null;
}

/**
 * Parses the `skills` column, which is a JSON array. Tolerates null and
 * malformed values — a bad row should not take a project's chat down.
 */
export function parseSkills(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string" && !!s.trim());
  } catch {
    return [];
  }
}

/**
 * Builds the ephemeral system prompt for one run.
 *
 * This used to return undefined for an unconfigured project, on the grounds
 * that overriding Hermes' own system prompt with nothing but boilerplate was
 * worse than not overriding it. That no longer holds: the outbox paragraph is
 * load-bearing — without it the agent has no way to hand a file back that the
 * phone is allowed to fetch — so there is always something worth sending.
 */
export function composeInstructions(
  project: ProjectInstructionInput,
): string {
  const parts: string[] = [];

  parts.push(
    `You are working in the "${project.name}" workspace — a long-lived thread the user returns to over time. Keep continuity with earlier turns in this conversation.`,
  );

  const custom = project.instructions?.trim();
  if (custom) parts.push(custom);

  // Linked skills are named, not inlined. Hermes can preload a skill's full
  // text (agent/skill_commands.py:564), but installed skills run to 100KB —
  // pasting one into every turn would cost ~25k tokens a message. Naming it
  // lets the agent pull it through skill_view only when it's actually needed.
  const skills = project.skills?.filter((s) => s.trim()) ?? [];
  if (skills.length > 0) {
    const list = skills.map((s) => `\`${s}\``).join(", ");
    parts.push(
      `Skills linked to this project: ${list}. Load ${
        skills.length > 1 ? "them" : "it"
      } with skill_view (e.g. skill_view(name='${skills[0]}')) before doing related work, and treat the contents as active guidance for this workspace.`,
    );
  }

  const cwd = project.cwd?.trim();
  if (cwd) {
    parts.push(
      `The working directory for this project is ${cwd}. Use absolute paths under it for file and terminal operations; your process's current directory is not set to it.`,
    );
  }

  parts.push(
    "This chat renders Markdown in your replies. Supported formatting is bold, italic, inline code, fenced code blocks, links, and bullet or numbered lists. Use only those forms when they improve readability; plain text is also rendered normally. Do not use headings, tables, blockquotes, raw HTML, or Markdown images.",
  );

  /* Recommendation and question cards. Nothing in Hermes' event vocabulary
   * carries a suggestion, a confidence, or a clarifying question —
   * approval.request is the only human-in-the-loop event, and it is a security
   * gate on dangerous commands, not a conversation. So the only way to get one
   * is to ask the agent for it in a shape the thread can recognise.
   * splitFences() already tokenises fences with their language tag, so a
   * tagged fence costs a branch on the client rather than a parser — and a
   * malformed one degrades to the code block it already is.
   *
   * This is re-sent on every single run, so its length is a standing cost per
   * turn. One example covers both kinds deliberately; a second JSON blob would
   * roughly double the block to say very little. */
  parts.push(
    [
      `When you are recommending a course of action, or need the user to choose between options before you can continue, end your reply with a fenced block tagged \`${RECOMMEND_FENCE}\` containing JSON:`,
      `\`\`\`${RECOMMEND_FENCE}` +
        '\n{"kind": "recommendation", "title": "Short recommendation", "rationale": "One or two sentences of why", "confidence": 0.8, "actions": [{"label": "Do it", "reply": "yes, go ahead"}, {"label": "Not now", "reply": "skip that for now"}]}\n```',
      "The app renders it as a card with one button per action; pressing a button sends that action's `reply` back as the user's next message, and they can always type something else instead. Use `\"kind\": \"question\"` and omit `confidence` when you are asking rather than advising. `confidence` is 0 to 1 and should be your honest estimate. Use at most four actions, and use this only when there is a real choice to make — not on every turn.",
    ].join("\n\n"),
  );

  // The one direction Hermes has no API for. /v1/runs can receive images and
  // nothing else, and there is no download endpoint on :8642 — so a file the
  // user asked for can only reach their phone if it is written somewhere this
  // app is willing to serve, and the agent is the only one who can put it
  // there. The path is stated absolutely because the gateway's cwd is its own,
  // not the project's.
  parts.push(
    [
      `To give the user a file — a document, an export, a chart, anything they asked you to produce — write it to ${project.outboxDir} and then state its full path in your reply.`,
      `Files there are downloadable from the chat app; files written anywhere else are not, with the exception of this project's own working directory. Create the directory if it does not exist. Mention the path in plain text (for example "Report: ${project.outboxDir}/report.pdf") — do not describe it, and do not paste the file's contents unless asked.`,
    ].join(" "),
  );

  return parts.join("\n\n");
}

export interface ProjectTemplate {
  id: string;
  label: string;
  emoji: string;
  instructions: string;
}

/**
 * Prefills for new projects. This is where the `/skill <name>` step of the
 * manual recipe actually lands — naming the skill in prose is what makes
 * the agent reach for it, since there's no per-session skills API on :8642.
 */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "blank",
    label: "Blank",
    emoji: "💬",
    instructions: "",
  },
  {
    id: "fitness",
    label: "Fitness & Food",
    emoji: "🏋️",
    instructions: [
      "This is the persistent fitness workspace. Use the fitness journal as the authoritative source for meals, weight, nutrition targets and training.",
      "Short messages are shorthand for journal actions — treat “log the same dinner” or “weighed in at 78.4” as entries to record, and ask only when genuinely ambiguous.",
      "Prefer the fitness skill for logging and analysis. Report weights in kg and energy in kcal.",
    ].join("\n\n"),
  },
  {
    id: "job-hunting",
    label: "Job Hunting",
    emoji: "🎯",
    instructions: [
      "This is the persistent job-hunting workspace. Track applications, contacts, interview stages and deadlines here.",
      "Keep a running pipeline: company, role, stage, next action, and date. When I mention a company, assume it belongs to the pipeline unless I say otherwise.",
      "Draft outreach and answers in my voice — direct, concrete, no filler.",
    ].join("\n\n"),
  },
  {
    id: "repo",
    label: "Code project",
    emoji: "🛠️",
    instructions: [
      "This is a persistent workspace for one code repository.",
      "Read before you edit, match the surrounding style, and prefer small reviewable changes. Run the tests before claiming something works.",
      "If this repo has an AGENTS.md or CLAUDE.md, read it at the start of a session and follow it — it is not auto-loaded over the API.",
    ].join("\n\n"),
  },
];
