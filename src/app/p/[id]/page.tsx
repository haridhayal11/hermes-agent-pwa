import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProjectRedirect({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const project = db.prepare(`SELECT session_id FROM projects WHERE id = ?`).get(id) as
    | { session_id: string }
    | undefined;
  if (!project) notFound();
  redirect(`/p/${id}/s/${project.session_id}`);
}
