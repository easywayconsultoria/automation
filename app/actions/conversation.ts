"use server";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProcess } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit/write";
import { prisma } from "@/lib/db/prisma";
import { parseDrawbackCsv, parsePortalCsv } from "@/lib/domain/government-csv";
import { matchInvoiceItem } from "@/lib/domain/analysis";
import { parseOperationalDocument } from "@/lib/domain/operational-documents";
import {
  processTools,
  runConversationTurn
} from "@/lib/ai/process-orchestrator";

function path(processId: string, message?: string) {
  return `/workspace/chat/${processId}${message ? `?message=${encodeURIComponent(message)}` : ""}`;
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
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/xml",
  "text/xml"
]);
const allowedExtensions = new Set([
  "pdf",
  "csv",
  "xlsx",
  "xml",
  "jpg",
  "jpeg",
  "png"
]);
const maxAttachmentBytes = Number(
  process.env.MAX_CONVERSATION_ATTACHMENT_BYTES ?? 10_000_000
);
const maxAttachmentsPerMessage = 5;
function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value !== "string" &&
      typeof value.arrayBuffer === "function" &&
      value.size
  );
}

function extension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function attachmentKind(file: File) {
  const ext = extension(file);
  if (ext === "csv")
    return file.name.toLowerCase().includes("drawback")
      ? ("DRAWBACK_CSV" as const)
      : ("PORTAL_UNICO_CSV" as const);
  if (ext === "pdf") return "INVOICE" as const;
  return "OTHER" as const;
}

export async function sendConversationWithAttachments(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  const files = formData.getAll("files").filter(isFile);
  if (!content && !files.length)
    redirect(path(processId, "Digite uma mensagem ou anexe um arquivo."));
  if (content.length > 4000)
    redirect(path(processId, "Mensagem maior que 4.000 caracteres."));
  if (files.length > maxAttachmentsPerMessage)
    redirect(path(processId, "Envie no máximo 5 arquivos por mensagem."));
  if (
    files.some(
      (file) =>
        !file.size ||
        file.size > maxAttachmentBytes ||
        !allowedExtensions.has(extension(file)) ||
        !allowedMime.has(file.type)
    )
  )
    redirect(
      path(
        processId,
        `Use PDF, CSV, XLSX, XML, JPG ou PNG com até ${Math.round(maxAttachmentBytes / 1_000_000)} MB por arquivo.`
      )
    );

  const { user, workspace, supabase } = await requireProcess(processId);
  const conversation = await prisma.conversation.findFirst({
    where: { workspaceId: workspace.id, importProcessId: processId }
  });
  if (!conversation) redirect(path(processId, "Conversa não encontrada."));
  const uploaded: {
    file: File;
    storagePath: string;
    kind: ReturnType<typeof attachmentKind>;
    processing: Awaited<ReturnType<typeof parseOperationalDocument>>;
  }[] = [];
  for (const file of files) {
    const processing = await parseOperationalDocument(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${workspace.id}/${processId}/${randomUUID()}-${safeName}`;
    const { error } = await supabase.storage
      .from("process-documents")
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (error) {
      if (uploaded.length)
        await supabase.storage
          .from("process-documents")
          .remove(uploaded.map((item) => item.storagePath));
      redirect(
        path(
          processId,
          `Falha no upload de ${file.name}. Nenhum arquivo foi enviado.`
        )
      );
    }
    uploaded.push({
      file,
      storagePath,
      kind: attachmentKind(file),
      processing
    });
  }
  let databaseCommitted = false;
  try {
    const persisted = await prisma.$transaction(async (tx) => {
      const attachmentRecords = [];
      for (const item of uploaded) {
        const document = await tx.processDocument.create({
          data: {
            workspaceId: workspace.id,
            importProcessId: processId,
            uploadedById: user.id,
            fileName: item.file.name,
            mimeType: item.file.type,
            storagePath: item.storagePath,
            type:
              item.processing?.detectedType ??
              (item.kind === "INVOICE"
                ? "INVOICE"
                : item.kind.includes("CSV")
                  ? "CSV"
                  : "SUPPORT_DOC"),
            detectedType: item.processing?.detectedType,
            status: item.processing?.status ?? "UPLOADED",
            parsedAt:
              item.processing?.status === "PARSED" ? new Date() : undefined,
            processingSummary: item.processing?.summary as
              | Prisma.InputJsonValue
              | undefined,
            processingErrors: item.processing?.errors as
              | Prisma.InputJsonValue
              | undefined
          }
        });
        const attachment = await tx.conversationAttachment.create({
          data: {
            conversationId: conversation.id,
            workspaceId: workspace.id,
            importProcessId: processId,
            processDocumentId: document.id,
            kind: item.kind,
            label: item.file.name,
            storagePath: item.storagePath,
            metadata: { mimeType: item.file.type, size: item.file.size },
            createdById: user.id
          }
        });
        attachmentRecords.push({
          id: attachment.id,
          documentId: document.id,
          name: item.file.name,
          kind: item.kind,
          mimeType: item.file.type,
          size: item.file.size,
          processingStatus: item.processing?.status ?? "UPLOADED"
        });
      }
      if (attachmentRecords.length)
        await tx.conversationMessage.create({
          data: {
            conversationId: conversation.id,
            workspaceId: workspace.id,
            role: "SYSTEM",
            content: `${attachmentRecords.length} arquivo(s) anexado(s) à conversa.`,
            structuredData: {
              type: "ATTACHMENT_BATCH",
              attachments: attachmentRecords
            },
            createdById: user.id
          }
        });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() }
      });
      return attachmentRecords;
    });
    databaseCommitted = true;
    const prompt =
      content ||
      `Recebi ${persisted.map((item) => item.name).join(", ")}. Confirme os anexos e indique o próximo passo operacional.`;
    const result = await runConversationTurn({
      processId,
      workspaceId: workspace.id,
      userId: user.id,
      message: prompt
    });
    await writeAudit(
      "conversation_message_with_attachments",
      user.id,
      workspace.id,
      { processId, files: String(persisted.length), toolName: result.toolName }
    );
  } catch (error) {
    if (!databaseCommitted && uploaded.length)
      await supabase.storage
        .from("process-documents")
        .remove(uploaded.map((item) => item.storagePath));
    if (databaseCommitted)
      redirect(
        path(
          processId,
          "Anexos salvos, mas a resposta da IA falhou. Tente enviar a mensagem novamente."
        )
      );
    throw error;
  }
  revalidatePath(path(processId));
  redirect(
    path(processId, files.length ? "Mensagem e anexos enviados." : undefined)
  );
}

const documentClassification = z.enum([
  "INVOICE",
  "PORTAL_UNICO_CSV",
  "DRAWBACK_CSV",
  "XLSX_OPERATIONAL",
  "XML_OPERATIONAL",
  "SUPPORT_DOC"
]);

export async function confirmConversationDocumentType(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  const classification = documentClassification.safeParse(
    formData.get("classification")
  );
  if (!classification.success)
    redirect(path(processId, "Tipo documental inválido."));
  const { user, workspace } = await requireProcess(processId);
  const attachment = await prisma.conversationAttachment.findFirst({
    where: {
      id: attachmentId,
      workspaceId: workspace.id,
      importProcessId: processId
    },
    include: { processDocument: true, conversation: true }
  });
  if (!attachment?.processDocument)
    redirect(path(processId, "Documento da conversa não encontrado."));
  const documentType =
    classification.data === "PORTAL_UNICO_CSV" ||
    classification.data === "DRAWBACK_CSV"
      ? ("CSV" as const)
      : classification.data;
  const attachmentType =
    classification.data === "PORTAL_UNICO_CSV" ||
    classification.data === "DRAWBACK_CSV" ||
    classification.data === "INVOICE"
      ? classification.data
      : ("OTHER" as const);
  const previousType = attachment.processDocument.confirmedType;
  await prisma.$transaction(async (tx) => {
    await tx.processDocument.updateMany({
      where: {
        id: attachment.processDocument!.id,
        workspaceId: workspace.id,
        importProcessId: processId
      },
      data: {
        type: documentType,
        confirmedType: documentType,
        typeConfirmedById: user.id,
        typeConfirmedAt: new Date(),
        status:
          attachment.processDocument!.status === "FAILED"
            ? "FAILED"
            : "REVIEWED"
      }
    });
    await tx.conversationAttachment.updateMany({
      where: {
        id: attachment.id,
        workspaceId: workspace.id,
        importProcessId: processId
      },
      data: { kind: attachmentType }
    });
    await tx.conversationMessage.create({
      data: {
        conversationId: attachment.conversation.id,
        workspaceId: workspace.id,
        role: "SYSTEM",
        content: `Tipo de ${attachment.label ?? attachment.processDocument!.fileName} confirmado como ${classification.data.replaceAll("_", " ")}.`,
        structuredData: {
          type: "DOCUMENT_CLASSIFICATION_CONFIRMED",
          attachmentId: attachment.id,
          processDocumentId: attachment.processDocument!.id,
          detectedType: attachment.processDocument!.detectedType,
          previousType,
          confirmedType: documentType,
          classification: classification.data
        },
        createdById: user.id
      }
    });
    await tx.conversation.update({
      where: { id: attachment.conversation.id },
      data: { updatedAt: new Date() }
    });
  });
  await writeAudit("document_type_confirmed", user.id, workspace.id, {
    processId,
    attachmentId,
    documentId: attachment.processDocument.id,
    detectedType: attachment.processDocument.detectedType ?? "",
    previousType: previousType ?? "",
    confirmedType: documentType,
    classification: classification.data
  });
  revalidatePath(path(processId));
  redirect(path(processId, "Tipo documental confirmado no contexto."));
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

export async function reviewRegistrationProposal(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const intent = z
    .enum(["SAVE", "ACCEPT", "DISMISS", "CONVERT"])
    .safeParse(formData.get("intent"));
  const fields = z
    .object({
      suggestedProductCode: z.string().trim().min(1).max(120),
      suggestedDescription: z.string().trim().min(2).max(500),
      suggestedNcm: z.string().trim().max(20).optional()
    })
    .safeParse({
      suggestedProductCode: formData.get("suggestedProductCode"),
      suggestedDescription: formData.get("suggestedDescription"),
      suggestedNcm:
        String(formData.get("suggestedNcm") ?? "").trim() || undefined
    });
  if (!intent.success || !fields.success)
    redirect(path(processId, "Revisão da proposta inválida."));
  const { user, workspace } = await requireProcess(processId);
  const proposal = await prisma.registrationProposal.findFirst({
    where: {
      id: proposalId,
      workspaceId: workspace.id,
      importProcessId: processId
    }
  });
  if (!proposal) redirect(path(processId, "Proposta não encontrada."));
  const target =
    intent.data === "ACCEPT"
      ? "ACCEPTED"
      : intent.data === "DISMISS"
        ? "DISMISSED"
        : intent.data === "CONVERT"
          ? "CONVERTED"
          : proposal.status;
  if (intent.data === "CONVERT" && proposal.status !== "ACCEPTED")
    redirect(path(processId, "Aceite a proposta antes de convertê-la."));
  if (
    intent.data === "ACCEPT" &&
    !["DRAFT", "PENDING_REVIEW"].includes(proposal.status)
  )
    redirect(path(processId, "A proposta não está disponível para aceite."));
  if (
    intent.data === "SAVE" &&
    !["DRAFT", "PENDING_REVIEW"].includes(proposal.status)
  )
    redirect(path(processId, "A proposta não está disponível para edição."));
  if (
    intent.data === "DISMISS" &&
    !["DRAFT", "PENDING_REVIEW", "ACCEPTED"].includes(proposal.status)
  )
    redirect(path(processId, "A proposta não pode ser dispensada."));
  await prisma.$transaction(async (tx) => {
    await tx.registrationProposal.updateMany({
      where: {
        id: proposal.id,
        workspaceId: workspace.id,
        importProcessId: processId
      },
      data: {
        ...fields.data,
        suggestedNcm: fields.data.suggestedNcm ?? null,
        status: target,
        reviewedById:
          target === "ACCEPTED" ||
          target === "DISMISSED" ||
          target === "CONVERTED"
            ? user.id
            : proposal.reviewedById,
        reviewedAt:
          target === "ACCEPTED" ||
          target === "DISMISSED" ||
          target === "CONVERTED"
            ? new Date()
            : proposal.reviewedAt
      }
    });
    await tx.registrationProposalEvent.create({
      data: {
        registrationProposalId: proposal.id,
        workspaceId: workspace.id,
        importProcessId: processId,
        fromStatus: proposal.status,
        toStatus: target,
        changes: fields.data,
        reason: String(formData.get("reason") ?? "").trim() || null,
        actorId: user.id
      }
    });
    if (target === "CONVERTED") {
      const conversation = await tx.conversation.findFirst({
        where: { workspaceId: workspace.id, importProcessId: processId },
        select: { id: true }
      });
      if (conversation)
        await tx.suggestedAction.create({
          data: {
            conversationId: conversation.id,
            workspaceId: workspace.id,
            importProcessId: processId,
            type: `REGISTRATION_PROPOSAL_${proposal.id}`,
            title: `Cadastrar produto ${fields.data.suggestedProductCode}`,
            description: `${fields.data.suggestedDescription}${fields.data.suggestedNcm ? ` · NCM ${fields.data.suggestedNcm}` : ""}`,
            status: "ACCEPTED"
          }
        });
    }
  });
  await writeAudit("registration_proposal_reviewed", user.id, workspace.id, {
    processId,
    proposalId,
    from: proposal.status,
    to: target,
    intent: intent.data
  });
  redirect(
    path(
      processId,
      intent.data === "CONVERT"
        ? "Proposta convertida em ação operacional."
        : "Proposta revisada."
    )
  );
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
  const layoutDefinitions = await prisma.csvLayoutDefinition.findMany({
    where: {
      type: isPortal ? "PORTAL_UNICO" : "DRAWBACK",
      status: "ACTIVE",
      OR: [{ workspaceId: workspace.id }, { workspaceId: null }]
    },
    orderBy: { version: "desc" }
  });
  const contracts = layoutDefinitions.map((definition) => ({
    version: definition.version,
    headers: Array.isArray(definition.expectedOrder)
      ? definition.expectedOrder.map(String)
      : [],
    aliases:
      definition.aliases &&
      typeof definition.aliases === "object" &&
      !Array.isArray(definition.aliases)
        ? Object.fromEntries(
            Object.entries(definition.aliases).map(([key, value]) => [
              key,
              String(value)
            ])
          )
        : {}
  }));
  const content = await data.text();
  const result = isPortal
    ? parsePortalCsv(content, contracts)
    : parseDrawbackCsv(content, contracts);
  const layout = layoutDefinitions.find(
    (definition) =>
      definition.version === result.detectedVersion &&
      Array.isArray(definition.expectedOrder) &&
      JSON.stringify(definition.expectedOrder.map(String)) ===
        JSON.stringify(result.header)
  );
  const invalidRows = new Set(result.errors.map((item) => item.line)).size;
  const [processItems, products, process] = await Promise.all([
    prisma.invoiceItem.findMany({
      where: { workspaceId: workspace.id, importProcessId: processId }
    }),
    prisma.productCatalog.findMany({
      where: { workspaceId: workspace.id, active: true },
      include: { aliases: true }
    }),
    prisma.importProcess.findFirst({
      where: { id: processId, workspaceId: workspace.id },
      select: { supplierId: true }
    })
  ]);
  const importStatus = !result.detectedVersion
    ? "FAILED"
    : result.errors.length
      ? "COMPLETED_WITH_ERRORS"
      : "COMPLETED";
  const portalCodes = new Map(
    result.rows.map((row) => [
      String(row.productCode).trim().toUpperCase(),
      row
    ])
  );
  const proposalItems = isPortal
    ? processItems.filter((item) => {
        const row = portalCodes.get(
          item.supplierCode?.trim().toUpperCase() ?? ""
        );
        const portalGap =
          !row ||
          !["REGISTERED", "ATIVO", "CADASTRADO"].includes(
            String(row.registrationStatus)
          );
        return (
          portalGap || !matchInvoiceItem(item, products, process?.supplierId)
        );
      })
    : [];
  const toolName = isPortal ? "parse_portal_csv" : "parse_drawback_csv";
  await prisma.$transaction(async (tx) => {
    if (isPortal) {
      const imported = await tx.portalCsvImport.upsert({
        where: { processDocumentId: attachment.processDocumentId! },
        create: {
          workspaceId: workspace.id,
          importProcessId: processId,
          processDocumentId: attachment.processDocumentId!,
          status: importStatus,
          csvLayoutId: layout?.id,
          detectedVersion: result.detectedVersion,
          header: result.header,
          errors: result.errors,
          validRows: result.rows.length,
          invalidRows,
          processedAt: new Date()
        },
        update: {
          status: importStatus,
          csvLayoutId: layout?.id,
          detectedVersion: result.detectedVersion,
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
          status: importStatus,
          csvLayoutId: layout?.id,
          detectedVersion: result.detectedVersion,
          header: result.header,
          errors: result.errors,
          validRows: result.rows.length,
          invalidRows,
          processedAt: new Date()
        },
        update: {
          status: importStatus,
          csvLayoutId: layout?.id,
          detectedVersion: result.detectedVersion,
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
        content: `${isPortal ? "Portal Único" : "Drawback"}: layout ${result.detectedVersion ?? "desconhecido"}, ${result.rows.length} linhas válidas e ${result.errors.length} erros de validação.`,
        structuredData: {
          toolName,
          detectedVersion: result.detectedVersion,
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
    if (isPortal) {
      const portalImport = await tx.portalCsvImport.findUnique({
        where: { processDocumentId: attachment.processDocumentId! }
      });
      for (const item of proposalItems) {
        const row = portalCodes.get(
          item.supplierCode?.trim().toUpperCase() ?? ""
        );
        const portalGap =
          !row ||
          !["REGISTERED", "ATIVO", "CADASTRADO"].includes(
            String(row.registrationStatus)
          );
        const unmatched = !matchInvoiceItem(
          item,
          products,
          process?.supplierId
        );
        const values = {
          portalCsvImportId: portalImport?.id,
          suggestedProductCode: item.supplierCode ?? `ITEM-${item.lineNumber}`,
          suggestedDescription: item.description,
          suggestedNcm: item.ncm,
          rationale: [
            portalGap
              ? `Sem cadastro ativo no layout Portal Único ${result.detectedVersion ?? "desconhecido"}.`
              : null,
            unmatched ? "Sem correspondência válida no catálogo interno." : null
          ]
            .filter(Boolean)
            .join(" ")
        };
        const existing = await tx.registrationProposal.findFirst({
          where: {
            workspaceId: workspace.id,
            importProcessId: processId,
            sourceItemId: item.id
          }
        });
        if (!existing)
          await tx.registrationProposal.create({
            data: {
              workspaceId: workspace.id,
              importProcessId: processId,
              sourceItemId: item.id,
              createdById: user.id,
              ...values
            }
          });
        else if (["DRAFT", "PENDING_REVIEW"].includes(existing.status))
          await tx.registrationProposal.updateMany({
            where: {
              id: existing.id,
              workspaceId: workspace.id,
              importProcessId: processId
            },
            data: values
          });
      }
    }
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
