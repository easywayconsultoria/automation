"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/write";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export type AuthState = { error?: string; success?: string };
const credentials = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres.").max(72)
});

function safeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/workspace";
}

export async function login(
  _: AuthState,
  formData: FormData
): Promise<AuthState> {
  const input = credentials.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: input.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(input.data);
  if (error) return { error: "E-mail ou senha inválidos." };
  await writeAudit("signin", data.user.id, undefined, { method: "password" });
  redirect(safeNext(formData.get("next")));
}

export async function signup(
  _: AuthState,
  formData: FormData
): Promise<AuthState> {
  const input = credentials
    .extend({ name: z.string().trim().min(2, "Informe seu nome.").max(100) })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: input.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.data.email,
    password: input.data.password,
    options: { data: { full_name: input.data.name } }
  });
  if (error)
    return {
      error: error.message.includes("registered")
        ? "Este e-mail já está cadastrado."
        : "Não foi possível criar sua conta."
    };
  if (data.user) {
    try {
      await prisma.userProfile.upsert({
        where: { id: data.user.id },
        create: {
          id: data.user.id,
          email: input.data.email,
          displayName: input.data.name
        },
        update: { email: input.data.email, displayName: input.data.name }
      });
      await writeAudit("signup", data.user.id, undefined, {
        method: "password"
      });
    } catch (profileError) {
      logger.warn("signup_profile_deferred", {
        userId: data.user.id,
        error: profileError instanceof Error ? profileError.message : "unknown"
      });
    }
  }
  if (data.session) redirect("/workspace");
  return {
    success: "Conta criada. Confira seu e-mail para confirmar o cadastro."
  };
}

export async function logout() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) await writeAudit("signout", user.id);
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = z
    .string()
    .email("Informe um e-mail válido.")
    .safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const origin = process.env.APP_URL;
  if (!origin) {
    logger.error("password_reset_config_missing");
    return { error: "Recuperação de senha temporariamente indisponível." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/update-password`
  });
  if (error) {
    logger.warn("password_reset_request_failed", { code: error.code });
  }
  return {
    success:
      "Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação."
  };
}

export async function updatePassword(
  _: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = z
    .string()
    .min(8, "A senha deve ter ao menos 8 caracteres.")
    .max(72)
    .safeParse(formData.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error)
    return { error: "O link expirou ou a senha não pôde ser alterada." };
  return { success: "Senha atualizada. Você já pode acessar seu workspace." };
}
