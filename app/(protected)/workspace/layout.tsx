import type { ReactNode } from "react";
import { requireWorkspace } from "@/lib/auth/context";
import { WorkspaceShell } from "@/components/workspace-shell";
import { isLayoutAdminEnabled } from "@/lib/config/features";

export default async function Layout({ children }: { children: ReactNode }) {
  const { user, workspace, role } = await requireWorkspace();
  const name =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : (user.email ?? "Usuário");
  return (
    <WorkspaceShell
      workspaceName={workspace.name}
      userName={name}
      email={user.email}
      showLayoutAdmin={
        isLayoutAdminEnabled() && (role === "OWNER" || role === "ADMIN")
      }
    >
      {children}
    </WorkspaceShell>
  );
}
