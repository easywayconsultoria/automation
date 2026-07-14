import type { ReactNode } from "react";
import { requireWorkspace } from "@/lib/auth/context";
import { WorkspaceShell } from "@/components/workspace-shell";

export default async function Layout({ children }: { children: ReactNode }) {
  const { user, workspace } = await requireWorkspace();
  const name =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : (user.email ?? "Usuário");
  return (
    <WorkspaceShell
      workspaceName={workspace.name}
      userName={name}
      email={user.email}
    >
      {children}
    </WorkspaceShell>
  );
}
