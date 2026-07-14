"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/actions/auth";

type Props = {
  mode: "login" | "signup" | "forgot" | "update";
  action: (state: AuthState, data: FormData) => Promise<AuthState>;
  next?: string;
};

export function AuthForm({ mode, action, next }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const labels = {
    login: "Entrar",
    signup: "Criar conta",
    forgot: "Enviar instruções",
    update: "Atualizar senha"
  };
  return (
    <form action={formAction} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <Field label="Nome" name="name" type="text" autoComplete="name" />
      )}
      {mode !== "update" && (
        <Field label="E-mail" name="email" type="email" autoComplete="email" />
      )}
      {mode !== "forgot" && (
        <Field
          label={mode === "update" ? "Nova senha" : "Senha"}
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          hint={mode !== "login" ? "Mínimo de 8 caracteres" : undefined}
        />
      )}
      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {state.success}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Aguarde..." : labels[mode]}
      </button>
      {mode === "login" && (
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="text-brand hover:underline">
            Esqueci minha senha
          </Link>
          <Link href="/signup" className="text-brand hover:underline">
            Criar conta
          </Link>
        </div>
      )}
      {mode !== "login" && mode !== "update" && (
        <p className="text-center text-sm text-slate-600">
          <Link href="/login" className="text-brand hover:underline">
            Voltar para o login
          </Link>
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        required
        {...props}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-ink outline-none ring-brand focus:ring-2"
      />
      {hint && (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}
