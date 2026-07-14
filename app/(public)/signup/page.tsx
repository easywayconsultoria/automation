import { signup } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export default function SignupPage() {
  return (
    <AuthShell
      title="Crie sua conta"
      subtitle="Comece a organizar suas operações aduaneiras."
    >
      <AuthForm mode="signup" action={signup} />
    </AuthShell>
  );
}
