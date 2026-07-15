import type { ReactNode } from "react";
import { requireWorkspace } from "@/lib/auth/context";
import { WorkspaceShell } from "@/components/workspace-shell";
import { isLayoutAdminEnabled } from "@/lib/config/features";
import { prisma } from "@/lib/db/prisma";

export default async function Layout({ children }: { children: ReactNode }) {
  const { user, workspace, role } = await requireWorkspace();
  const name =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : (user.email ?? "Usuário");
  const processes = await prisma.importProcess.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      reference: true,
      status: true,
      conversation: { select: { title: true } }
    }
  });
  return (
    <WorkspaceShell
      workspaceName={workspace.name}
      userName={name}
      email={user.email}
      showLayoutAdmin={
        isLayoutAdminEnabled() && (role === "OWNER" || role === "ADMIN")
      }
      processes={processes.map((process) => ({
        id: process.id,
        title: process.conversation?.title ?? process.reference,
        reference: process.reference,
        status: process.status
      }))}
    >
      {children}
    </WorkspaceShell>
  );
}
