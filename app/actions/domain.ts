"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireProcess, requireWorkspace } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit/write";
import { actionForFinding, analyzeProcess } from "@/lib/domain/analysis";
import { parseInvoiceCsv } from "@/lib/domain/csv";

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}
function processPath(id: string, message?: string) {
  return `/workspace/processes/${id}${message ? `?message=${encodeURIComponent(message)}` : ""}`;
}

export async function createImportProcess(formData: FormData) {
  const schema = z.object({
    reference: z.string().trim().min(2).max(60),
    clientName: z.string().trim().min(2).max(120)
  });
  const parsed = schema.safeParse({
    reference: formData.get("reference"),
    clientName: formData.get("clientName")
  });
  if (!parsed.success)
    redirect("/workspace/processes?message=Revise os campos obrigatórios.");
  const { user, workspace } = await requireWorkspace();
  const process = await prisma.importProcess.create({
    data: {
      workspaceId: workspace.id,
      createdById: user.id,
      ...parsed.data,
      exporterName: optional(formData.get("exporterName")),
      originCountry: optional(formData.get("originCountry")),
      incoterm: optional(formData.get("incoterm"))?.toUpperCase(),
      invoiceNumber: optional(formData.get("invoiceNumber")),
      notes: optional(formData.get("notes"))
    }
  });
  await writeAudit("import_process_created", user.id, workspace.id, {
    processId: process.id,
    reference: process.reference
  });
  redirect(processPath(process.id, "Processo criado."));
}

export async function addInvoiceItem(formData: FormData) {
  const processId = String(formData.get("processId"));
  const { user, workspace } = await requireProcess(processId);
  const schema = z.object({
    lineNumber: z.coerce.number().int().positive(),
    description: z.string().trim().min(1).max(500),
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
    totalPrice: z.coerce.number()
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(processPath(processId, "Item inválido."));
  const item = await prisma.invoiceItem.create({
    data: {
      workspaceId: workspace.id,
      importProcessId: processId,
      ...parsed.data,
      supplierCode: optional(formData.get("supplierCode")),
      ncm: optional(formData.get("ncm")),
      unit: optional(formData.get("unit")),
      currency: optional(formData.get("currency"))?.toUpperCase() ?? "USD",
      countryOfOrigin: optional(formData.get("countryOfOrigin"))
    }
  });
  await writeAudit("invoice_item_created", user.id, workspace.id, {
    processId,
    itemId: item.id
  });
  revalidatePath(processPath(processId));
  redirect(processPath(processId, "Item adicionado."));
}

const allowedMime = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg"
]);
function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value !== "string" &&
      typeof value.name === "string" &&
      typeof value.size === "number" &&
      typeof value.arrayBuffer === "function"
  );
}
export async function uploadProcessDocument(formData: FormData) {
  const processId = String(formData.get("processId"));
  const { user, workspace, supabase } = await requireProcess(processId);
  const file = formData.get("file");
  if (
    !isUploadedFile(file) ||
    !file.size ||
    file.size > 3_500_000 ||
    !allowedMime.has(file.type)
  )
    redirect(processPath(processId, "Arquivo inválido ou maior que 3,5 MB."));
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${workspace.id}/${processId}/${randomUUID()}-${safeName}`;
  const { error } = await supabase.storage
    .from("process-documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error)
    redirect(processPath(processId, "Falha ao armazenar o documento."));
  const type = z
    .enum([
      "INVOICE",
      "PACKING_LIST",
      "CSV",
      "DECLARATION",
      "SUPPORT_DOC",
      "OTHER"
    ])
    .catch("OTHER")
    .parse(formData.get("type"));
  try {
    const document = await prisma.processDocument.create({
      data: {
        workspaceId: workspace.id,
        importProcessId: processId,
        uploadedById: user.id,
        fileName: file.name,
        mimeType: file.type,
        storagePath: path,
        type
      }
    });
    await writeAudit("process_document_uploaded", user.id, workspace.id, {
      processId,
      documentId: document.id,
      type
    });
  } catch (dbError) {
    await supabase.storage.from("process-documents").remove([path]);
    throw dbError;
  }
  redirect(processPath(processId, "Documento enviado."));
}

export async function importInvoiceCsv(formData: FormData) {
  const processId = String(formData.get("processId"));
  const { user, workspace } = await requireProcess(processId);
  const file = formData.get("csv");
  if (!isUploadedFile(file) || !file.size || file.size > 1_000_000)
    redirect(processPath(processId, "CSV inválido ou maior que 1 MB."));
  const result = parseInvoiceCsv(await file.text());
  if (result.errors.length)
    redirect(processPath(processId, result.errors.slice(0, 5).join(" | ")));
  try {
    await prisma.$transaction(async (tx) => {
      const document = await tx.processDocument.create({
        data: {
          workspaceId: workspace.id,
          importProcessId: processId,
          uploadedById: user.id,
          fileName: file.name,
          mimeType: "text/csv",
          type: "CSV",
          source: "UPLOAD",
          status: "PARSED",
          parsedAt: new Date()
        }
      });
      await tx.invoiceItem.createMany({
        data: result.rows.map((row) => ({
          workspaceId: workspace.id,
          importProcessId: processId,
          processDocumentId: document.id,
          lineNumber: Number(row.lineNumber),
          supplierCode: row.supplierCode || null,
          description: row.description,
          ncm: row.ncm || null,
          quantity: row.quantity,
          unit: row.unit || null,
          unitPrice: row.unitPrice,
          totalPrice: row.totalPrice,
          grossWeight: row.grossWeight || null,
          netWeight: row.netWeight || null,
          currency: row.currency || "USD",
          countryOfOrigin: row.countryOfOrigin || null,
          rawData: row
        }))
      });
    });
  } catch {
    redirect(processPath(processId, "CSV conflita com linhas já importadas."));
  }
  await writeAudit("invoice_csv_imported", user.id, workspace.id, {
    processId,
    rows: String(result.rows.length)
  });
  redirect(processPath(processId, `${result.rows.length} itens importados.`));
}

export async function runProcessAnalysis(formData: FormData) {
  const processId = String(formData.get("processId"));
  const { user, workspace } = await requireProcess(processId);
  const [items, products, drawback] = await Promise.all([
    prisma.invoiceItem.findMany({
      where: { workspaceId: workspace.id, importProcessId: processId }
    }),
    prisma.productCatalog.findMany({
      where: { workspaceId: workspace.id, active: true },
      include: { aliases: true }
    }),
    prisma.drawbackRecord.findFirst({
      where: { workspaceId: workspace.id, importProcessId: processId }
    })
  ]);
  const findings = analyzeProcess(
    items,
    products,
    drawback?.status === "DRAFT"
  );
  await prisma.$transaction(async (tx) => {
    await tx.inconsistency.deleteMany({
      where: {
        workspaceId: workspace.id,
        importProcessId: processId,
        detectedBy: "SYSTEM",
        status: "OPEN"
      }
    });
    if (findings.length)
      await tx.inconsistency.createMany({
        data: findings.map((finding) => ({
          ...finding,
          workspaceId: workspace.id,
          importProcessId: processId
        }))
      });
    await tx.importProcess.update({
      where: { id: processId },
      data: { status: findings.length ? "PENDING_ACTION" : "COMPLIANT" }
    });
  });
  await writeAudit("process_analyzed", user.id, workspace.id, {
    processId,
    findings: String(findings.length)
  });
  redirect(
    processPath(
      processId,
      `Análise concluída: ${findings.length} inconsistências.`
    )
  );
}

export async function generateActionPlan(formData: FormData) {
  const processId = String(formData.get("processId"));
  const { user, workspace } = await requireProcess(processId);
  const open = await prisma.inconsistency.findMany({
    where: {
      workspaceId: workspace.id,
      importProcessId: processId,
      status: "OPEN"
    },
    orderBy: { createdAt: "asc" }
  });
  const groups = new Map<string, typeof open>();
  open.forEach((item) =>
    groups.set(item.type, [...(groups.get(item.type) ?? []), item])
  );
  await prisma.$transaction(async (tx) => {
    const plan = await tx.actionPlan.upsert({
      where: { importProcessId: processId },
      create: {
        workspaceId: workspace.id,
        importProcessId: processId,
        summary: `${open.length} inconsistências abertas requerem ação.`
      },
      update: {
        summary: `${open.length} inconsistências abertas requerem ação.`,
        status: "OPEN",
        generatedBy: "SYSTEM"
      }
    });
    await tx.actionPlanItem.deleteMany({
      where: {
        workspaceId: workspace.id,
        actionPlanId: plan.id,
        status: { not: "DONE" }
      }
    });
    const entries = [...groups.values()].map((items) => {
      const base = actionForFinding({
        type: items[0].type,
        severity: items[0].severity,
        title: items[0].title,
        description: items[0].description
      });
      return {
        workspaceId: workspace.id,
        actionPlanId: plan.id,
        ...base,
        description:
          items.length > 1
            ? `${base.description} (${items.length} ocorrências)`
            : base.description,
        sourceInconsistencyId: items.length === 1 ? items[0].id : null
      };
    });
    if (entries.length) await tx.actionPlanItem.createMany({ data: entries });
  });
  await writeAudit("action_plan_generated", user.id, workspace.id, {
    processId,
    inconsistencies: String(open.length)
  });
  redirect(processPath(processId, "Plano de ação gerado."));
}

export async function saveDrawback(formData: FormData) {
  const processId = String(formData.get("processId"));
  const { user, workspace } = await requireProcess(processId);
  const mode = z.enum(["ISENCAO", "SUSPENSAO"]).parse(formData.get("mode"));
  const record = await prisma.drawbackRecord.upsert({
    where: { importProcessId: processId },
    create: {
      workspaceId: workspace.id,
      importProcessId: processId,
      mode,
      referenceCode: optional(formData.get("referenceCode")),
      notes: optional(formData.get("notes"))
    },
    update: {
      mode,
      referenceCode: optional(formData.get("referenceCode")),
      notes: optional(formData.get("notes"))
    }
  });
  await writeAudit("drawback_saved", user.id, workspace.id, {
    processId,
    drawbackId: record.id
  });
  redirect(processPath(processId, "Drawback salvo."));
}
