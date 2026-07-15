"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireLayoutAdmin } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit/write";
import { prisma } from "@/lib/db/prisma";
import { parseDrawbackCsv, parsePortalCsv } from "@/lib/domain/government-csv";

const adminPath = (message?: string) =>
  `/workspace/admin/layouts${message ? `?message=${encodeURIComponent(message)}` : ""}`;
const jsonArray = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
function jsonObject(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
function layoutInput(formData: FormData) {
  const base = z
    .object({
      name: z.string().trim().min(2).max(120),
      type: z.enum(["PORTAL_UNICO", "DRAWBACK"]),
      version: z
        .string()
        .trim()
        .regex(/^\d+\.\d+(?:\.\d+)?$/),
      description: z.string().trim().min(5).max(500)
    })
    .safeParse({
      name: formData.get("name"),
      type: formData.get("type"),
      version: formData.get("version"),
      description: formData.get("description")
    });
  const requiredColumns = jsonArray(formData.get("requiredColumns"));
  const optionalColumns = jsonArray(formData.get("optionalColumns"));
  const expectedOrder = jsonArray(formData.get("expectedOrder"));
  const aliases = jsonObject(formData.get("aliases"));
  const validationRules = jsonObject(formData.get("validationRules"));
  if (
    !base.success ||
    !requiredColumns.length ||
    !expectedOrder.length ||
    !aliases ||
    !validationRules
  )
    return null;
  if (!requiredColumns.every((column) => expectedOrder.includes(column)))
    return null;
  return {
    ...base.data,
    requiredColumns,
    optionalColumns,
    expectedOrder,
    aliases,
    validationRules
  };
}

export async function createCsvLayout(formData: FormData) {
  const input = layoutInput(formData);
  if (!input) redirect(adminPath("Contrato inválido. Revise colunas e JSON."));
  const { user, workspace } = await requireLayoutAdmin();
  const duplicate = await prisma.csvLayoutDefinition.findFirst({
    where: {
      workspaceId: workspace.id,
      type: input.type,
      version: input.version
    },
    select: { id: true }
  });
  if (duplicate) redirect(adminPath("Essa versão já existe no workspace."));
  const layout = await prisma.csvLayoutDefinition.create({
    data: { workspaceId: workspace.id, status: "DRAFT", ...input }
  });
  await writeAudit("csv_layout_created", user.id, workspace.id, {
    layoutId: layout.id,
    type: layout.type,
    version: layout.version
  });
  redirect(adminPath("Contrato criado em rascunho."));
}

export async function updateCsvLayout(formData: FormData) {
  const layoutId = String(formData.get("layoutId") ?? "");
  const input = layoutInput(formData);
  if (!input) redirect(adminPath("Contrato inválido."));
  const { user, workspace } = await requireLayoutAdmin();
  const layout = await prisma.csvLayoutDefinition.findFirst({
    where: { id: layoutId, workspaceId: workspace.id }
  });
  if (!layout)
    redirect(adminPath("Somente contratos do workspace podem ser editados."));
  if (layout.status !== "DRAFT")
    redirect(adminPath("Somente contratos em DRAFT podem ser editados."));
  const duplicate = await prisma.csvLayoutDefinition.findFirst({
    where: {
      id: { not: layout.id },
      workspaceId: workspace.id,
      type: input.type,
      version: input.version
    },
    select: { id: true }
  });
  if (duplicate) redirect(adminPath("Essa versão já existe no workspace."));
  await prisma.csvLayoutDefinition.updateMany({
    where: { id: layout.id, workspaceId: workspace.id, status: "DRAFT" },
    data: input
  });
  await writeAudit("csv_layout_updated", user.id, workspace.id, {
    layoutId: layout.id,
    version: input.version
  });
  redirect(adminPath("Contrato atualizado."));
}

export async function transitionCsvLayout(formData: FormData) {
  const layoutId = String(formData.get("layoutId") ?? "");
  const target = z
    .enum(["DRAFT", "TESTING", "ACTIVE", "INACTIVE", "DEPRECATED"])
    .safeParse(formData.get("target"));
  if (!target.success) redirect(adminPath("Estado inválido."));
  const { user, workspace } = await requireLayoutAdmin();
  const layout = await prisma.csvLayoutDefinition.findFirst({
    where: { id: layoutId, workspaceId: workspace.id },
    include: {
      sandboxTests: {
        where: { passed: true },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
  if (!layout)
    redirect(adminPath("Contrato global é somente leitura ou não existe."));
  const transitions: Record<string, string[]> = {
    DRAFT: ["TESTING", "INACTIVE"],
    TESTING: ["DRAFT", "ACTIVE", "INACTIVE"],
    ACTIVE: ["INACTIVE", "DEPRECATED"],
    INACTIVE: ["DRAFT", "ACTIVE"],
    DEPRECATED: []
  };
  if (!transitions[layout.status].includes(target.data))
    redirect(adminPath("Transição não permitida."));
  if (target.data === "ACTIVE" && !layout.sandboxTests.length)
    redirect(adminPath("Ativação exige pelo menos um teste sandbox aprovado."));
  if (target.data === "ACTIVE") {
    const active = await prisma.csvLayoutDefinition.findMany({
      where: {
        type: layout.type,
        status: "ACTIVE",
        OR: [{ workspaceId: workspace.id }, { workspaceId: null }],
        id: { not: layout.id }
      },
      select: { id: true, expectedOrder: true }
    });
    if (
      active.some(
        (item) =>
          JSON.stringify(item.expectedOrder) ===
          JSON.stringify(layout.expectedOrder)
      )
    )
      redirect(adminPath("Já existe layout ACTIVE com a mesma assinatura."));
  }
  await prisma.$transaction([
    prisma.csvLayoutDefinition.updateMany({
      where: {
        id: layout.id,
        workspaceId: workspace.id,
        status: layout.status
      },
      data: { status: target.data }
    }),
    prisma.csvLayoutStatusEvent.create({
      data: {
        csvLayoutId: layout.id,
        workspaceId: workspace.id,
        fromStatus: layout.status,
        toStatus: target.data,
        reason: String(formData.get("reason") ?? "").trim() || null,
        actorId: user.id
      }
    })
  ]);
  await writeAudit("csv_layout_status_changed", user.id, workspace.id, {
    layoutId: layout.id,
    from: layout.status,
    to: target.data
  });
  redirect(adminPath(`Contrato movido para ${target.data}.`));
}

export async function testCsvLayoutSandbox(formData: FormData) {
  const layoutId = String(formData.get("layoutId") ?? "");
  const file = formData.get("file");
  const { user, workspace } = await requireLayoutAdmin();
  if (!file || typeof file === "string" || !file.size || file.size > 1_000_000)
    redirect(adminPath("Amostra CSV inválida ou maior que 1 MB."));
  const layout = await prisma.csvLayoutDefinition.findFirst({
    where: {
      id: layoutId,
      OR: [{ workspaceId: workspace.id }, { workspaceId: null }],
      status: { in: ["DRAFT", "TESTING", "ACTIVE"] }
    }
  });
  if (!layout) redirect(adminPath("Layout indisponível para teste."));
  const headers = Array.isArray(layout.expectedOrder)
    ? layout.expectedOrder.map(String)
    : [];
  const aliases =
    layout.aliases &&
    typeof layout.aliases === "object" &&
    !Array.isArray(layout.aliases)
      ? Object.fromEntries(
          Object.entries(layout.aliases).map(([key, value]) => [
            key,
            String(value)
          ])
        )
      : {};
  const result =
    layout.type === "PORTAL_UNICO"
      ? parsePortalCsv(await file.text(), [
          { version: layout.version, headers, aliases }
        ])
      : parseDrawbackCsv(await file.text(), [
          { version: layout.version, headers, aliases }
        ]);
  const invalidRows = new Set(result.errors.map((item) => item.line)).size;
  const passed =
    result.detectedVersion === layout.version &&
    result.errors.length === 0 &&
    result.rows.length > 0;
  await prisma.csvLayoutSandboxTest.create({
    data: {
      csvLayoutId: layout.id,
      workspaceId: workspace.id,
      actorId: user.id,
      fileName: file.name,
      detectedHeader: result.header,
      mappedHeader: result.header.map((item) => aliases[item] ?? item),
      validRows: result.rows.length,
      invalidRows,
      errors: result.errors,
      preview: result.rows.slice(0, 10),
      passed
    }
  });
  await writeAudit("csv_layout_sandbox_tested", user.id, workspace.id, {
    layoutId: layout.id,
    passed: String(passed),
    validRows: String(result.rows.length),
    invalidRows: String(invalidRows)
  });
  redirect(
    adminPath(
      passed
        ? "Teste sandbox aprovado."
        : "Teste sandbox falhou. Revise os erros."
    )
  );
}
