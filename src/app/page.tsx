import { redirect } from "next/navigation";
import { APP_NAME } from "@/lib/branding";
import { db } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "./EmptyState";
import type { Project } from "@/lib/chat-types";

export const dynamic = "force-dynamic";

export default function Home() {
  const projects = db
    .prepare(`SELECT * FROM projects WHERE archived = 0 ORDER BY pinned DESC, last_active_at DESC`)
    .all() as Project[];

  if (projects.length > 0) redirect(`/p/${projects[0].id}`);

  return (
    <AppShell projects={projects} title={APP_NAME}>
      <EmptyState />
    </AppShell>
  );
}
