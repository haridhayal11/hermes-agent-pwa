import { redirect } from "next/navigation";
import { APP_NAME } from "@/lib/branding";
import { AppShell } from "@/components/AppShell";
import { loadShellData } from "@/lib/shell-data";
import { EmptyState } from "./EmptyState";

export const dynamic = "force-dynamic";

/* `/` opens a chat: the pinned project first, else the most recently active.
 * There was a Home dashboard here for a while; what it showed now lives in
 * the header's notifications panel, one tap from any chat, so the screen the
 * app opens on is the conversation itself. Pin General to always land there. */
export default function Index() {
  const { projects, sessions } = loadShellData();
  if (projects.length > 0) redirect(`/p/${projects[0].id}`);
  return (
    <AppShell projects={projects} sessions={sessions} title={APP_NAME}>
      <EmptyState />
    </AppShell>
  );
}
