import { APP_NAME } from "@/lib/branding";
import { AppShell } from "@/components/AppShell";
import { HomeView } from "@/components/home/HomeView";
import { loadShellData } from "@/lib/shell-data";
import { EmptyState } from "./EmptyState";

export const dynamic = "force-dynamic";

/* Home: what is happening across every project. It used to redirect into the
 * most recent one, which hid a run finishing or an approval waiting anywhere
 * else until you went looking. Live state comes from ActivityContext; the
 * server only supplies the project list. */
export default function Home() {
  const { projects, sessions } = loadShellData();
  return (
    <AppShell projects={projects} sessions={sessions} title={projects.length ? "Home" : APP_NAME}>
      {projects.length > 0 ? <HomeView projects={projects} /> : <EmptyState />}
    </AppShell>
  );
}
