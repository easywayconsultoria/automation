import { requestPasswordReset } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export default function ForgotPage() {
  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Enviaremos um link seguro para seu e-mail."
    >
      <AuthForm mode="forgot" action={requestPasswordReset} />
    </AuthShell>
  );
}
