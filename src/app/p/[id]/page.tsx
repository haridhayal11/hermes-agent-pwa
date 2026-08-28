import { notFound, redirect } from "next/navigation";
import { projectEntrySession } from "@/lib/project-sessions";

export const dynamic = "force-dynamic";

export default async function ProjectRedirect({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const session = projectEntrySession(id);
  if (!session) notFound();
  redirect(`/p/${id}/s/${session.session_id}`);
}
