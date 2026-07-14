"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProcess } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit/write";
import { prisma } from "@/lib/db/prisma";
import {
  processTools,
  runConversationTurn
} from "@/lib/ai/process-orchestrator";

function path(processId: string, message?: string) {
  return `/workspace/processes/${processId}${message ? `?message=${encodeURIComponent(message)}` : ""}`;
}

export async function sendConversationMessage(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const content = z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .safeParse(formData.get("content"));
  if (!content.success)
    redirect(path(processId, "Digite uma mensagem válida."));
  const { user, workspace } = await requireProcess(processId);
  const result = await runConversationTurn({
    processId,
    workspaceId: workspace.id,
    userId: user.id,
    message: content.data
  });
  await writeAudit("conversation_turn_completed", user.id, workspace.id, {
    processId,
    toolName: result.toolName
  });
  revalidatePath(path(processId));
  redirect(path(processId));
}

export async function runConversationQuickAction(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const tool = z.enum(processTools).safeParse(formData.get("toolName"));
  if (!tool.success) redirect(path(processId, "Ação rápida inválida."));
  const { user, workspace } = await requireProcess(processId);
  const result = await runConversationTurn({
    processId,
    workspaceId: workspace.id,
    userId: user.id,
    requestedTool: tool.data
  });
  await writeAudit("conversation_tool_executed", user.id, workspace.id, {
    processId,
    toolName: result.toolName
  });
  revalidatePath(path(processId));
  redirect(path(processId));
}

const allowedMime = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg"
]);
function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value !== "string" &&
      typeof value.arrayBuffer === "function" &&
      value.size
  );
}

export async function uploadConversationAttachment(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const kind = z
    .enum(["INVOICE", "PORTAL_UNICO_CSV", "DRAWBACK_CSV", "OTHER"])
    .catch("OTHER")
    .parse(formData.get("kind"));
  const file = formData.get("file");
  const { user, workspace, supabase } = await requireProcess(processId);
  if (!isFile(file) || file.size > 3_500_000 || !allowedMime.has(file.type))
    redirect(path(processId, "Anexo inválido ou maior que 3,5 MB."));
  const conversation = await prisma.conversation.findFirst({
    where: { workspaceId: workspace.id, importProcessId: processId }
  });
  if (!conversation) redirect(path(processId, "Conversa não encontrada."));
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${workspace.id}/${processId}/${randomUUID()}-${safeName}`;
  const { error } = await supabase.storage
    .from("process-documents")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (error) redirect(path(processId, "Falha ao armazenar o anexo."));
  const documentType =
    kind === "INVOICE"
      ? "INVOICE"
      : kind === "PORTAL_UNICO_CSV" || kind === "DRAWBACK_CSV"
        ? "CSV"
        : "SUPPORT_DOC";
  try {
    await prisma.$transaction(async (tx) => {
      const document = await tx.processDocument.create({
        data: {
          workspaceId: workspace.id,
          importProcessId: processId,
          uploadedById: user.id,
          fileName: file.name,
          mimeType: file.type,
          storagePath,
          type: documentType
        }
      });
      await tx.conversationAttachment.create({
        data: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
          importProcessId: processId,
          processDocumentId: document.id,
          kind,
          label: file.name,
          storagePath,
          metadata: { mimeType: file.type, size: file.size },
          createdById: user.id
        }
      });
      await tx.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
          role: "SYSTEM",
          content: `Novo anexo adicionado ao contexto: ${file.name}`,
          structuredData: { kind, processDocumentId: document.id }
        }
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() }
      });
    });
  } catch (dbError) {
    await supabase.storage.from("process-documents").remove([storagePath]);
    throw dbError;
  }
  await writeAudit("conversation_attachment_uploaded", user.id, workspace.id, {
    processId,
    kind,
    fileName: file.name
  });
  redirect(path(processId, "Arquivo adicionado ao contexto da conversa."));
}
