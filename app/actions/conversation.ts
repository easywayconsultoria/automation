"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProcess } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit/write";
import { prisma } from "@/lib/db/prisma";
import { parseDrawbackCsv, parsePortalCsv } from "@/lib/domain/government-csv";
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

export async function transitionSuggestedAction(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const actionId = String(formData.get("actionId") ?? "");
  const toStatus = z
    .enum(["OPEN", "ACCEPTED", "DISMISSED", "COMPLETED"])
    .safeParse(formData.get("toStatus"));
  if (!toStatus.success) redirect(path(processId, "Transição inválida."));
  const { user, workspace } = await requireProcess(processId);
  const action = await prisma.suggestedAction.findFirst({
    where: {
      id: actionId,
      importProcessId: processId,
      workspaceId: workspace.id
    }
  });
  if (!action) redirect(path(processId, "Sugestão não encontrada."));
  const allowed: Record<string, string[]> = {
    OPEN: ["ACCEPTED", "DISMISSED"],
    ACCEPTED: ["COMPLETED", "DISMISSED", "OPEN"],
    DISMISSED: ["OPEN"],
    COMPLETED: ["OPEN"]
  };
  if (!allowed[action.status].includes(toStatus.data))
    redirect(path(processId, "Transição não permitida."));
  await prisma.$transaction([
    prisma.suggestedAction.updateMany({
      where: {
        id: action.id,
        workspaceId: workspace.id,
        importProcessId: processId
      },
      data: { status: toStatus.data }
    }),
    prisma.suggestedActionEvent.create({
      data: {
        suggestedActionId: action.id,
        workspaceId: workspace.id,
        importProcessId: processId,
        fromStatus: action.status,
        toStatus: toStatus.data,
        reason: String(formData.get("reason") ?? "").trim() || null,
        actorId: user.id
      }
    })
  ]);
  await writeAudit("suggested_action_transitioned", user.id, workspace.id, {
    processId,
    actionId,
    from: action.status,
    to: toStatus.data
  });
  redirect(path(processId, "Status da sugestão atualizado."));
}

export async function parseConversationCsv(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  const { user, workspace, supabase } = await requireProcess(processId);
  const attachment = await prisma.conversationAttachment.findFirst({
    where: {
      id: attachmentId,
      workspaceId: workspace.id,
      importProcessId: processId,
      kind: { in: ["PORTAL_UNICO_CSV", "DRAWBACK_CSV"] }
    },
    include: { conversation: true }
  });
  if (!attachment?.storagePath || !attachment.processDocumentId)
    redirect(path(processId, "CSV contextual inválido."));
  const { data, error } = await supabase.storage
    .from("process-documents")
    .download(attachment.storagePath);
  if (error || !data)
    redirect(path(processId, "Não foi possível ler o CSV privado."));
  const isPortal = attachment.kind === "PORTAL_UNICO_CSV";
  const result = isPortal
    ? parsePortalCsv(await data.text())
    : parseDrawbackCsv(await data.text());
  const invalidRows = new Set(result.errors.map((item) => item.line)).size;
  const processItems = await prisma.invoiceItem.findMany({
    where: { workspaceId: workspace.id, importProcessId: processId }
  });
  const toolName = isPortal ? "parse_portal_csv" : "parse_drawback_csv";
  await prisma.$transaction(async (tx) => {
    if (isPortal) {
      const imported = await tx.portalCsvImport.upsert({
        where: { processDocumentId: attachment.processDocumentId! },
        create: {
          workspaceId: workspace.id,
          importProcessId: processId,
          processDocumentId: attachment.processDocumentId!,
          status: result.errors.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
          header: result.header,
          errors: result.errors,
          validRows: result.rows.length,
          invalidRows,
          processedAt: new Date()
        },
        update: {
          status: result.errors.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
          header: result.header,
          errors: result.errors,
          validRows: result.rows.length,
          invalidRows,
          processedAt: new Date()
        }
      });
      await tx.portalCsvRow.deleteMany({
        where: { portalCsvImportId: imported.id, workspaceId: workspace.id }
      });
      if (result.rows.length)
        await tx.portalCsvRow.createMany({
          data: result.rows.map((row) => ({
            workspaceId: workspace.id,
            importProcessId: processId,
            portalCsvImportId: imported.id,
            lineNumber: Number(row.lineNumber),
            productCode: String(row.productCode),
            description: String(row.description),
            ncm: String(row.ncm) || null,
            registrationStatus: String(row.registrationStatus),
            rawData: row.rawData as object
          }))
        });
    } else {
      const imported = await tx.drawbackCsvImport.upsert({
        where: { processDocumentId: attachment.processDocumentId! },
        create: {
          workspaceId: workspace.id,
          importProcessId: processId,
          processDocumentId: attachment.processDocumentId!,
          status: result.errors.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
          header: result.header,
          errors: result.errors,
          validRows: result.rows.length,
          invalidRows,
          processedAt: new Date()
        },
        update: {
          status: result.errors.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
          header: result.header,
          errors: result.errors,
          validRows: result.rows.length,
          invalidRows,
          processedAt: new Date()
        }
      });
      await tx.drawbackCsvRow.deleteMany({
        where: { drawbackCsvImportId: imported.id, workspaceId: workspace.id }
      });
      if (result.rows.length)
        await tx.drawbackCsvRow.createMany({
          data: result.rows.map((row) => ({
            workspaceId: workspace.id,
            importProcessId: processId,
            drawbackCsvImportId: imported.id,
            lineNumber: Number(row.lineNumber),
            referenceCode: String(row.referenceCode),
            productCode: String(row.productCode),
            ncm: String(row.ncm) || null,
            grantedQuantity: Number(row.grantedQuantity),
            usedQuantity: Number(row.usedQuantity),
            availableBalance: Number(row.availableBalance),
            unit: String(row.unit) || null,
            rawData: row.rawData as object
          }))
        });
    }
    await tx.toolExecution.create({
      data: {
        conversationId: attachment.conversationId,
        workspaceId: workspace.id,
        importProcessId: processId,
        toolName,
        input: { attachmentId },
        output: { validRows: result.rows.length, errors: result.errors },
        criteria: { parser: "header-and-row-validation", version: 1 },
        sources: {
          attachmentId,
          processDocumentId: attachment.processDocumentId
        },
        limitations: { noFuzzyMatching: true, noExternalValidation: true },
        status: "COMPLETED",
        completedAt: new Date()
      }
    });
    const assistantMessage = await tx.conversationMessage.create({
      data: {
        conversationId: attachment.conversationId,
        workspaceId: workspace.id,
        role: "ASSISTANT",
        content: `${isPortal ? "Portal Único" : "Drawback"}: ${result.rows.length} linhas válidas e ${result.errors.length} erros de validação.`,
        structuredData: {
          toolName,
          criteria: "Validação determinística de cabeçalho e linhas",
          sources: [attachment.label],
          limitations: [
            "Sem consulta a sistemas governamentais",
            "Sem matching aproximado"
          ],
          errors: result.errors
        }
      }
    });
    const suggestions = isPortal
      ? processItems
          .filter((item) => {
            const row = result.rows.find(
              (entry) =>
                String(entry.productCode).trim().toUpperCase() ===
                item.supplierCode?.trim().toUpperCase()
            );
            return (
              !row ||
              !["REGISTERED", "ATIVO", "CADASTRADO"].includes(
                String(row.registrationStatus)
              )
            );
          })
          .map((item) => ({
            type: `PORTAL_REGISTRATION_${item.id}`,
            title: `Preparar cadastro do item ${item.lineNumber}`,
            description: `O código ${item.supplierCode ?? "não informado"} não possui cadastro ativo confirmado no CSV ${attachment.label}.`
          }))
      : processItems
          .filter((item) => {
            const row = result.rows.find(
              (entry) =>
                String(entry.productCode).trim().toUpperCase() ===
                item.supplierCode?.trim().toUpperCase()
            );
            return !row || Number(row.availableBalance) < Number(item.quantity);
          })
          .map((item) => ({
            type: `DRAWBACK_COVERAGE_${item.id}`,
            title: `Revisar cobertura do item ${item.lineNumber}`,
            description: `O saldo do CSV ${attachment.label} não cobre a quantidade ${item.quantity.toString()} do item.`
          }));
    await tx.suggestedAction.deleteMany({
      where: {
        workspaceId: workspace.id,
        importProcessId: processId,
        status: "OPEN",
        type: {
          startsWith: isPortal ? "PORTAL_REGISTRATION_" : "DRAWBACK_COVERAGE_"
        }
      }
    });
    if (suggestions.length)
      await tx.suggestedAction.createMany({
        data: suggestions.map((suggestion) => ({
          ...suggestion,
          conversationId: attachment.conversationId,
          workspaceId: workspace.id,
          importProcessId: processId,
          sourceMessageId: assistantMessage.id
        }))
      });
  });
  await writeAudit("conversation_csv_parsed", user.id, workspace.id, {
    processId,
    attachmentId,
    toolName,
    validRows: String(result.rows.length),
    errors: String(result.errors.length)
  });
  redirect(path(processId, "CSV processado e registrado na conversa."));
}
