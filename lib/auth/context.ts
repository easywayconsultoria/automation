import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateWorkspace } from "@/lib/workspace/get-or-create";
import { prisma } from "@/lib/db/prisma";

export async function requireWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const existing = await prisma.workspace.findFirst({
    where: { members: { some: { userId: user.id } } }
  });
  const workspace = existing ?? (await getOrCreateWorkspace(user));
  return { user, workspace, supabase };
}

export async function requireProcess(processId: string) {
  const context = await requireWorkspace();
  const process = await prisma.importProcess.findFirst({
    where: { id: processId, workspaceId: context.workspace.id }
  });
  if (!process) notFound();
  return { ...context, process };
}
