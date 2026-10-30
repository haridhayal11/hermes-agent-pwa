"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePreferences } from "@/components/PreferencesContext";
import { useStatus } from "@/hooks/useStatus";
import { useModels } from "@/hooks/useModels";
import { useBots } from "@/hooks/useBots";
import type { Bot } from "@/lib/bots";
import { usePush, isIos, isIosSafari, isStandalone } from "@/hooks/usePush";
import {
  FIELD_CLASS,
  Segmented,
  SettingsAction,
  SettingsRow,
  SettingsSection,
  Toggle,
  buttonClass,
} from "@/components/ui/SettingsControls";
import { useAgentName, useSetAgentName } from "@/components/AgentNameContext";
import { AGENT_NAME_MAX, APP_NAME } from "@/lib/branding";
import { IconArrowLeft } from "@/components/primitives/icons";
import { JobSheet } from "@/components/settings/JobSheet";
import { useJobs, type Job } from "@/hooks/useJobs";
import {
  PUSH_KINDS,
  PUSH_KIND_HINTS,
  PUSH_KIND_LABELS,
  type PushKind,
} from "@/lib/notification-kinds";
import { DISCLOSURES } from "@/lib/preferences";
import type { Disclosure } from "@/lib/preferences";
import type { Project } from "@/lib/chat-types";

/* Everything here is per-device and lands in localStorage. The one exception
 * is the notification switch, which has to tell the server about this
 * browser's push endpoint — see usePush. */

const DISCLOSURE_OPTIONS = [
  { value: "hidden" as Disclosure, label: "Hidden" },
  { value: "collapsed" as Disclosure, label: "Minimised" },
  { value: "expanded" as Disclosure, label: "Expanded" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Stats {
  dbPath: string;
  dbBytes: number;
  projects: number;
  archivedProjects: number;
  runs: number;
  runEvents: number;
  queued: number;
  hermesUrl: string;
}

export function SettingsView({ version }: { version: string }) {
  const { prefs, setPref } = usePreferences();

  return (
    <div className="flex h-app w-full flex-col overflow-hidden bg-page">
      <header className="pt-safe z-30 shrink-0 bg-page">
        <div className="grid h-13 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 px-1.5">
          <Link
            href="/"
            aria-label="Back"
            className="tap-target flex size-10 items-center justify-center rounded-control
              text-ink-2 transition-[transform,background-color,color] duration-150
              hover:bg-hover hover:text-ink active:scale-[0.96]"
          >
            <IconArrowLeft size={20} />
          </Link>
          <h1 className="text-center text-ui font-semibold text-ink">Settings</h1>
          <span className="size-10" />
        </div>
      </header>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-safe pb-safe mx-auto w-full max-w-2xl pb-12">
          <SettingsSection title="Appearance">
            <SettingsRow
              stacked
              label="Theme"
              control={
                <Segmented
                  label="Theme"
                  value={prefs.theme}
                  onChange={(value) => setPref("theme", value)}
                  options={[
                    { value: "system", label: "System" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
              }
            />
            <SettingsRow
              stacked
              label="Text size"
              hint="The composer stays at 16px on a phone whatever this says — anything smaller makes iOS zoom the viewport on focus and never zoom back."
              control={
                <Segmented
                  label="Text size"
                  value={prefs.textSize}
                  onChange={(value) => setPref("textSize", value)}
                  options={[
                    { value: "small", label: "Small" },
                    { value: "normal", label: "Normal" },
                    { value: "large", label: "Large" },
                  ]}
                />
              }
            />
            <SettingsRow
              label="Reduce motion"
              hint="Removes transitions and entrance animations. Already on if your device asks for it."
              control={
                <Toggle
                  label="Reduce motion"
                  checked={prefs.reduceMotion}
                  onChange={(value) => setPref("reduceMotion", value)}
                />
              }
            />
          </SettingsSection>

          <AgentSection />

          <SettingsSection title="Chat">
            <SettingsRow
              stacked
              label="Tool calls"
              hint="How the activity block starts out on each run. You can still open or close it in the thread."
              control={
                <Segmented
                  label="Tool calls"
                  value={prefs.toolCalls}
                  onChange={(value) => setPref("toolCalls", value)}
                  options={DISCLOSURE_OPTIONS.filter((o) =>
                    DISCLOSURES.includes(o.value),
                  )}
                />
              }
            />
            <SettingsRow
              stacked
              label="Thinking trace"
              hint="Whether this device shows the agent's reasoning. Separate from the model picker's Thinking, which decides whether the model does any."
              control={
                <Segmented
                  label="Thinking trace"
                  value={prefs.thinking}
                  onChange={(value) => setPref("thinking", value)}
                  options={DISCLOSURE_OPTIONS}
                />
              }
            />
            <SettingsRow
              label="Enter sends"
              hint="Off makes return insert a newline everywhere; the send button is then the only way to send."
              control={
                <Toggle
                  label="Enter sends"
                  checked={prefs.sendOnEnter}
                  onChange={(value) => setPref("sendOnEnter", value)}
                />
              }
            />
            <SettingsRow
              label="Follow the reply"
              hint="Scroll to the newest tokens while a run is streaming."
              control={
                <Toggle
                  label="Follow the reply"
                  checked={prefs.autoScroll}
                  onChange={(value) => setPref("autoScroll", value)}
                />
              }
            />
            <SettingsRow
              label="Show run duration"
              control={
                <Toggle
                  label="Show run duration"
                  checked={prefs.showRunDuration}
                  onChange={(value) => setPref("showRunDuration", value)}
                />
              }
            />
            <SettingsRow
              label="Haptics"
              hint="A tick on send and when a run finishes. Android and desktop Chrome only — iOS has no vibration API."
              control={
                <Toggle
                  label="Haptics"
                  checked={prefs.haptics}
                  onChange={(value) => setPref("haptics", value)}
                />
              }
            />
          </SettingsSection>

          <NotificationsSection />
          <ScheduledSection />
          <RetiredThreadsSection />
          <ConnectionSection />
          <BotsSection />
          <ArchivedSection />
          <DataSection />

          <SettingsSection title="About">
            <SettingsRow label={APP_NAME} control={<Meta>{version}</Meta>} />
            <SettingsRow
              label="Preferences"
              hint="Stored on this device only. Your iPhone and your Mac keep their own."
              control={<Meta>local</Meta>}
            />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-label text-ink-2">{children}</span>;
}

/* What the agent is called.
 *
 * Not a preference: it is stored server-side and shared by every device, which
 * is the whole difference between this section and the ones around it. Saved
 * on blur rather than per keystroke — a PUT per character to a box someone is
 * still typing in is a lot of round trips to say nothing.
 */
function AgentSection() {
  const agentName = useAgentName();
  const save = useSetAgentName();
  const [draft, setDraft] = useState(agentName);
  const [error, setError] = useState<string | null>(null);

  const commit = async () => {
    if (draft.trim() === agentName) return;
    try {
      const saved = await save(draft);
      setDraft(saved);
      setError(null);
    } catch {
      setDraft(agentName);
      setError("Could not save — the name is unchanged.");
    }
  };

  return (
    <SettingsSection title="Agent">
      <SettingsRow
        stacked
        label="Name"
        hint={
          error ??
          `What the thread calls it — the speaker label, the composer placeholder and the approval prompts. Shared by every device, unlike everything else here. Blank resets it to ${APP_NAME}.`
        }
        control={
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            maxLength={AGENT_NAME_MAX}
            placeholder={APP_NAME}
            aria-label="Agent name"
            className={FIELD_CLASS}
          />
        }
      />
    </SettingsSection>
  );
}

function NotificationsSection() {
  const { state, busy, error, subscriptions, kinds, setKinds, enable, disable, test } =
    usePush();
  // Derived rather than stored: `hydrated` is false on the server and on the
  // first client render, so the UA sniff can't cause a hydration mismatch.
  const { hydrated } = usePreferences();
  const hint = hydrated && isIos() && !isStandalone();
  // The Share-sheet steps are Safari's; any other iOS browser is sent there.
  const safari = hint && isIosSafari();

  const on = state === "on";
  const actionable = state === "on" || state === "off";

  return (
    <SettingsSection title="Notifications">
      {hint && (
        <div className="my-3 rounded-card bg-field px-4 py-3">
          <p className="text-ui font-medium text-ink">
            Add {APP_NAME} to your Home Screen first
          </p>
          <p data-selectable className="mt-0.5 text-label leading-snug text-ink-2">
            iOS only allows notifications from a Home Screen app.{" "}
            {safari ? "Tap Share" : "Open this page in Safari, tap Share"}, then “Add to Home
            Screen”, and open {APP_NAME} from there.
          </p>
        </div>
      )}

      <SettingsRow
        label="Notifications on this device"
        hint={
          state === "unconfigured"
            ? "The server has no VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY and restart."
            : state === "denied"
              ? "Blocked in the browser. Re-allow notifications for this site to turn it back on."
              : state === "needs-install"
                ? `Unavailable until ${APP_NAME} is on the home screen.`
                : state === "unsupported"
                  ? "This browser has no Push API."
                  : "The master switch for this device. What it sends is below."
        }
        control={
          <Toggle
            label="Notifications"
            checked={on}
            disabled={busy || !actionable}
            onChange={(next) => void (next ? enable() : disable())}
          />
        }
      />

      {/* Per kind, and per device — these live on this browser's push
        * subscription row rather than in a settings table, so the phone and
        * the Mac keep their own answer the way every other preference does.
        * They have to be server-side at all because the Node process is what
        * decides whether to send, and it cannot read localStorage. */}
      {on &&
        PUSH_KINDS.map((kind) => (
          <SettingsRow
            key={kind}
            label={PUSH_KIND_LABELS[kind as Exclude<PushKind, "test">]}
            hint={PUSH_KIND_HINTS[kind as Exclude<PushKind, "test">]}
            control={
              <Toggle
                label={PUSH_KIND_LABELS[kind as Exclude<PushKind, "test">]}
                checked={kinds.includes(kind)}
                onChange={(next) =>
                  void setKinds(
                    next
                      ? [...kinds, kind]
                      : kinds.filter((k) => k !== kind),
                  )
                }
              />
            }
          />
        ))}

      {on && (
        <SettingsAction
          label="Send a test notification"
          hint={`${subscriptions} device${subscriptions === 1 ? "" : "s"} subscribed.`}
          actionLabel="Send"
          onAction={() => void test()}
        />
      )}

      {error && (
        <p className="py-3 text-label text-red">{error}</p>
      )}
    </SettingsSection>
  );
}

/* Hermes' cron jobs, one list across every project.
 *
 * Global rather than per project because that is what they are: the schedule
 * lives in the gateway and is shared with the CLI and Telegram, and a job
 * needs no project at all. Whether it reports to this app — always into the
 * General chat — is a property of the job, shown here as a chip.
 */
function ScheduledSection() {
  const { jobs, unavailable, error, refresh } = useJobs();
  const [editing, setEditing] = useState<Job | null>(null);
  const [creating, setCreating] = useState(false);

  // Nothing until the list is known, same as Archived — a heading that appears
  // and then rearranges itself is worse than one that arrives a beat late.
  if (jobs === null) return null;

  if (unavailable) {
    return (
      <SettingsSection title="Scheduled">
        <SettingsRow
          label="Not available"
          hint="This Hermes has no cron module, so there is nothing to schedule. /v1/capabilities can't answer this — it reports jobs_admin as false either way — so the app asks /api/jobs directly."
          control={<Meta>—</Meta>}
        />
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection
        title="Scheduled"
        description="Hermes' cron jobs — the same ones the CLI and Telegram see. Point one at this app and its result lands in the General chat, where you can reply to it."
      >
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            onClick={() => setEditing(job)}
            className="relative isolate block w-full text-left before:absolute before:inset-x-[-0.5rem]
              before:inset-y-1 before:-z-10 before:rounded-control before:transition-colors
              before:duration-150 hover:before:bg-hover"
          >
            <SettingsRow
              label={job.name}
              hint={describeJob(job)}
              control={
                <span className="flex shrink-0 items-center gap-1.5">
                  {job.binding && (
                    <span className="max-w-[7rem] truncate rounded-chip bg-field px-1.5 text-meta text-ink-2">
                      {job.binding.project_name ?? "General"}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${
                      job.enabled === false
                        ? "bg-ink-3"
                        : job.last_status && job.last_status !== "ok"
                          ? "bg-red"
                          : "bg-green"
                    }`}
                  />
                </span>
              }
            />
          </button>
        ))}

        <SettingsAction
          label="New job"
          hint={
            error ??
            `Runs on Hermes' schedule whether or not ${APP_NAME} is open, which is the point.`
          }
          actionLabel="Add"
          onAction={() => setCreating(true)}
        />
      </SettingsSection>

      <JobSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={refresh}
      />
      {editing && (
        <JobSheet
          job={editing}
          open
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

/** The one line under a job's name: when it runs, and how that went. */
function describeJob(job: Job): string {
  const parts = [job.schedule_display || job.schedule?.display || "—"];
  if (job.enabled === false) parts.push("paused");
  else if (job.next_run_at) {
    // Rendered with the gateway's offset intact: Hermes anchors naive
    // timestamps to its own timezone, not the browser's.
    parts.push(`next ${new Date(job.next_run_at).toLocaleString()}`);
  }
  if (job.last_status && job.last_status !== "ok") parts.push("last run failed");
  return parts.join(" · ");
}

/* What /v1/capabilities advertises, in the order it matters here. Shown
 * because Hermes versions differ enough that "why is there no model picker"
 * is otherwise unanswerable from inside the app. */
const FEATURE_LABELS: [keyof ReturnType<typeof useStatus>["features"], string][] = [
  ["run_steer", "steer"],
  ["model_options", "models"],
  ["session_fork", "branch"],
  ["skills_api", "skills"],
  ["toolsets", "toolsets"],
];

function ConnectionSection() {
  const { reachable, model, version, features, activeRuns, loaded } = useStatus();
  /* useStatus reads /v1/capabilities, which answers "hermes-agent" — the
   * virtual OpenAI-compatible alias, not the model Hermes runs. Only
   * /api/model/options knows that, so prefer it and keep the alias as the
   * fallback for a gateway that doesn't serve the inventory. */
  const { payload: models } = useModels();
  const resolved = models?.current.model ?? model;
  const [host, setHost] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/maintenance")
      .then((r) => r.json())
      .then((body: { hermesUrl?: string }) => {
        if (!cancelled) setHost(body.hermesUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsSection title="Connection">
      <SettingsRow
        label="Hermes"
        control={
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={`size-2 rounded-full ${
                !loaded ? "bg-ink-3" : reachable ? "bg-green" : "bg-red"
              }`}
            />
            <Meta>{!loaded ? "…" : reachable ? "reachable" : "offline"}</Meta>
          </span>
        }
      />
      <SettingsRow label="Endpoint" control={<Meta>{host ?? "…"}</Meta>} />
      {/* Display only — what the gateway can do is read from its
        * capabilities below, never inferred from this. */}
      <SettingsRow
        label="Version"
        control={<Meta>{!loaded ? "…" : (version ?? "not reported")}</Meta>}
      />
      {/* The gateway default. A project's own model is picked from the chip in
        * its composer — model choice is per project, not per device. */}
      <SettingsRow label="Default model" control={<Meta>{resolved ?? "unknown"}</Meta>} />
      <SettingsRow
        label="Supports"
        control={
          <span className="flex flex-wrap justify-end gap-1">
            {!loaded || !reachable ? (
              <Meta>—</Meta>
            ) : (
              FEATURE_LABELS.map(([key, label]) => (
                <span
                  key={label}
                  className={`rounded-chip px-1.5 text-meta ${
                    features[key] ? "bg-green-tint text-green" : "bg-field text-ink-3 line-through"
                  }`}
                >
                  {label}
                </span>
              ))
            )}
          </span>
        }
      />
      <SettingsRow label="Active runs" control={<Meta>{activeRuns}</Meta>} />
    </SettingsSection>
  );
}

/* Hermes Bot Mode's roster, as this gateway serves it.
 *
 * Read-only: profiles are created in the Hermes desktop app or with
 * `hermes profile create`, and there is no endpoint to do it over the API.
 * What this can do is say why a Bot isn't offered in New project — almost
 * always a missing per-profile key, which the gateway requires and Bot Mode
 * does not write for you. */
function BotsSection() {
  const roster = useBots();
  if (!roster || roster.bots.length === 0) return null;

  const hintFor = (bot: Bot): string => {
    const where = bot.id === "default" ? "~/.hermes/.env" : `~/.hermes/profiles/${bot.id}/.env`;
    switch (bot.status) {
      case "ready":
        return bot.botChatProjectId
          ? "Its Bot Chat is a project here."
          : bot.description ?? "Ready — pick it in New project.";
      case "no_key":
        return `Add API_SERVER_KEY to ${where} (openssl rand -hex 32). The gateway rejects the default key for another profile.`;
      case "key_unreadable":
        return `This app's user can't read ${where} — Hermes creates it 0600. Grant read access, or set HERMES_PROFILE_${bot.id.toUpperCase().replace(/-/g, "_")}_KEY in this app's environment.`;
      case "bad_key":
        return `The gateway rejected the API_SERVER_KEY in ${where}.`;
      case "not_served":
        return "The gateway answers 404 for this profile — it is parked, standalone, or this Hermes predates profile routing.";
      case "unreachable":
        return "Hermes did not answer.";
    }
  };

  return (
    <SettingsSection
      title="Bots"
      description={
        roster.managed
          ? "Hermes profiles on this gateway. A project bound to one runs as that Bot; its Bot Chat can message the others."
          : "Hermes profiles on this gateway. A project bound to one runs as that Bot. Turn on Bot Mode in the Hermes desktop app to let them message each other."
      }
    >
      {roster.bots.map((bot) => (
        <SettingsRow
          key={bot.id}
          label={bot.name}
          hint={hintFor(bot)}
          control={<Meta>{bot.status === "ready" ? `@${bot.handle}` : bot.status.replace("_", " ")}</Meta>}
        />
      ))}
    </SettingsSection>
  );
}

/* What retiring the per-project Scheduled inboxes hid: the inboxes and the
 * threads that replying to a report used to spawn. The upgrade only hides
 * them, because they are transcripts in Hermes and some people want to keep
 * them; deleting them is this explicit, confirmed step. Gone once empty. */
function RetiredThreadsSection() {
  const [count, setCount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/scheduled/retired");
        const body = (await res.json()) as { count?: number };
        if (!cancelled) setCount(body.count ?? 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scheduled/retired", { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { failed?: number };
      if (!res.ok) {
        setError(
          `${body.failed ?? "Some"} couldn't be deleted — Hermes refused. They're still hidden; try again later.`,
        );
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
      setConfirming(false);
      setReload((n) => n + 1);
    }
  }

  if (!count) return null;
  const threads = `${count} thread${count === 1 ? "" : "s"}`;

  return (
    <SettingsSection
      title="Old scheduled threads"
      description="Scheduled reports used to arrive in a Scheduled inbox per project, with a new thread for every reply. They now land in the General chat, and the old threads are hidden here but kept in Hermes."
    >
      {!confirming ? (
        <SettingsAction
          label={`${threads} kept in Hermes`}
          hint={error ?? "Still reachable from the Hermes CLI and dashboard. Delete them if you don't need them."}
          actionLabel="Delete…"
          tone="danger"
          onAction={() => setConfirming(true)}
        />
      ) : (
        <SettingsRow
          label={`Delete ${threads} for good?`}
          hint="Removes them here and in Hermes. Their reports already live in the General chat. This can't be undone."
          control={
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className={buttonClass("secondary", "sm")}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className={buttonClass("ghost-danger", "sm")}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </span>
          }
        />
      )}
    </SettingsSection>
  );
}

function ArchivedSection() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Bumped after every mutation; the fetch lives inside the effect so no state
  // is written synchronously from the effect body.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/projects?archived=1");
        const body = (await res.json()) as { projects: Project[] };
        if (!cancelled) setProjects(body.projects);
      } catch {
        if (!cancelled) setProjects([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function unarchive(id: string) {
    setBusy(id);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    setBusy(null);
    setReload((n) => n + 1);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    // purge without session=1: the Hermes transcript survives and stays
    // reachable from the CLI, only our rows go.
    await fetch(`/api/projects/${id}?purge=1`, { method: "DELETE" });
    setBusy(null);
    setReload((n) => n + 1);
    router.refresh();
  }

  // Nothing until the list is known: an empty "Archived projects" heading that
  // then vanishes is worse than the section appearing a beat late.
  if (projects === null || projects.length === 0) return null;

  return (
    <SettingsSection
      title="Archived projects"
      description="Hidden from the rail, otherwise untouched."
    >
      {projects.map((project) => (
        <SettingsRow
          key={project.id}
          label={`${project.emoji ? `${project.emoji} ` : ""}${project.name}`}
          hint={new Date(project.last_active_at).toLocaleDateString()}
          control={
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy === project.id}
                onClick={() => void unarchive(project.id)}
                className={buttonClass("secondary", "sm")}
              >
                Restore
              </button>
              <button
                type="button"
                disabled={busy === project.id}
                onClick={() => void remove(project.id)}
                className={buttonClass("ghost-danger", "sm")}
              >
                Delete
              </button>
            </span>
          }
        />
      ))}
    </SettingsSection>
  );
}

function DataSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pruning, setPruning] = useState(false);
  const [pruned, setPruned] = useState<number | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/maintenance");
        const body = (await res.json()) as Stats;
        if (!cancelled) setStats(body);
      } catch {
        if (!cancelled) setStats(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function prune() {
    setPruning(true);
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: 24 }),
      });
      const body = (await res.json()) as { removed?: number };
      setPruned(body.removed ?? 0);
      setReload((n) => n + 1);
    } finally {
      setPruning(false);
    }
  }

  return (
    <SettingsSection title="Data">
      <SettingsRow
        label="Database"
        hint={stats?.dbPath}
        control={<Meta>{stats ? formatBytes(stats.dbBytes) : "…"}</Meta>}
      />
      <SettingsRow
        label="Runs"
        control={<Meta>{stats ? `${stats.runs} · ${stats.runEvents} events` : "…"}</Meta>}
      />
      <SettingsAction
        label="Prune the event log"
        hint={
          pruned === null
            ? "Drops the replay log for runs that ended more than a day ago. Transcripts are unaffected — they live in Hermes."
            : `Removed ${pruned} event${pruned === 1 ? "" : "s"}.`
        }
        actionLabel={pruning ? "Pruning…" : "Prune"}
        onAction={() => void prune()}
        disabled={pruning}
      />
    </SettingsSection>
  );
}
