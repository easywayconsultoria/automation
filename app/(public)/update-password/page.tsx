import { updatePassword } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export default function UpdatePage() {
  return (
    <AuthShell
      title="Defina uma nova senha"
      subtitle="Escolha uma senha segura para sua conta."
    >
      <AuthForm mode="update" action={updatePassword} />
    </AuthShell>
  );
}
