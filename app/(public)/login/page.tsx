import { login } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell
      title="Bem-vindo de volta"
      subtitle="Acesse seu workspace operacional."
    >
      <AuthForm mode="login" action={login} next={next} />
    </AuthShell>
  );
}
