"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireProcess, requireWorkspace } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit/write";
import {
  actionForFinding,
  analyzeProcess,
  normalizeProductText
} from "@/lib/domain/analysis";
import { parseInvoiceCsv } from "@/lib/domain/csv";

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}
function processPath(id: string, message?: string) {
  return `/workspace/processes/${id}${message ? `?message=${encodeURIComponent(message)}` : ""}`;
}
function catalogPath(message?: string) {
  return `/workspace/catalog${message ? `?message=${encodeURIComponent(message)}` : ""}`;
}
function suppliersPath(message?: string) {
  return `/workspace/suppliers${message ? `?message=${encodeURIComponent(message)}` : ""}`;
}

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  externalCode: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional()
});

function supplierInput(formData: FormData) {
  return supplierSchema.safeParse({
    name: formData.get("name"),
    externalCode: optional(formData.get("externalCode")),
    country: optional(formData.get("country"))
  });
}

export async function createSupplier(formData: FormData) {
  const parsed = supplierInput(formData);
  if (!parsed.success)
    redirect(suppliersPath("Revise os dados do fornecedor."));
  const { user, workspace } = await requireWorkspace();
  const normalizedName = normalizeProductText(parsed.data.name);
  const duplicate = await prisma.supplier.findFirst({
    where: {
      workspaceId: workspace.id,
      OR: [
        { normalizedName },
        ...(parsed.data.externalCode
          ? [
              {
                externalCode: {
                  equals: parsed.data.externalCode,
                  mode: "insensitive" as const
                }
              }
            ]
          : [])
      ]
    },
    select: { id: true }
  });
  if (duplicate)
    redirect(suppliersPath("Fornecedor ou código externo já cadastrado."));
  const supplier = await prisma.supplier.create({
    data: { workspaceId: workspace.id, normalizedName, ...parsed.data }
  });
  await writeAudit("supplier_created", user.id, workspace.id, {
    supplierId: supplier.id
  });
  redirect(suppliersPath("Fornecedor criado."));
}

export async function updateSupplier(formData: FormData) {
  const supplierId = String(formData.get("supplierId") ?? "");
  const parsed = supplierInput(formData);
  if (!z.string().uuid().safeParse(supplierId).success || !parsed.success)
    redirect(suppliersPath("Fornecedor inválido."));
  const { user, workspace } = await requireWorkspace();
  const normalizedName = normalizeProductText(parsed.data.name);
  const duplicate = await prisma.supplier.findFirst({
    where: {
      workspaceId: workspace.id,
      id: { not: supplierId },
      OR: [
        { normalizedName },
        ...(parsed.data.externalCode
          ? [
              {
                externalCode: {
                  equals: parsed.data.externalCode,
                  mode: "insensitive" as const
                }
              }
            ]
          : [])
      ]
    },
    select: { id: true }
  });
  if (duplicate)
    redirect(suppliersPath("Fornecedor ou código externo já cadastrado."));
  const updated = await prisma.supplier.updateMany({
    where: { id: supplierId, workspaceId: workspace.id },
    data: { normalizedName, ...parsed.data }
  });
  if (!updated.count) redirect(suppliersPath("Fornecedor não encontrado."));
  await writeAudit("supplier_updated", user.id, workspace.id, { supplierId });
  redirect(suppliersPath("Fornecedor atualizado."));
}

export async function toggleSupplier(formData: FormData) {
  const supplierId = String(formData.get("supplierId") ?? "");
  const { user, workspace } = await requireWorkspace();
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, workspaceId: workspace.id },
    select: { active: true }
  });
  if (!supplier) redirect(suppliersPath("Fornecedor não encontrado."));
  await prisma.supplier.updateMany({
    where: { id: supplierId, workspaceId: workspace.id },
    data: { active: !supplier.active }
  });
  await writeAudit("supplier_status_changed", user.id, workspace.id, {
    supplierId,
    active: String(!supplier.active)
  });
  redirect(
    suppliersPath(
      supplier.active ? "Fornecedor desativado." : "Fornecedor ativado."
    )
  );
}

const productSchema = z.object({
  internalCode: z.string().trim().min(1).max(80),
  description: z.string().trim().min(2).max(500),
  ncm: z.string().trim().max(20).optional(),
  defaultUnit: z.string().trim().max(20).optional()
});

function productInput(formData: FormData) {
  return productSchema.safeParse({
    internalCode: formData.get("internalCode"),
    description: formData.get("description"),
    ncm: optional(formData.get("ncm")),
    defaultUnit: optional(formData.get("defaultUnit"))
  });
}

export async function createCatalogProduct(formData: FormData) {
  const parsed = productInput(formData);
  if (!parsed.success) redirect(catalogPath("Revise os dados do produto."));
  const { user, workspace } = await requireWorkspace();
  const duplicate = await prisma.productCatalog.findFirst({
    where: {
      workspaceId: workspace.id,
      internalCode: { equals: parsed.data.internalCode, mode: "insensitive" }
    },
    select: { id: true }
  });
  if (duplicate) redirect(catalogPath("Já existe um produto com esse código."));
  const product = await prisma.productCatalog.create({
    data: { workspaceId: workspace.id, ...parsed.data }
  });
  await writeAudit("catalog_product_created", user.id, workspace.id, {
    productCatalogId: product.id
  });
  redirect(catalogPath("Produto criado."));
}

export async function updateCatalogProduct(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const parsed = productInput(formData);
  if (!z.string().uuid().safeParse(productId).success || !parsed.success)
    redirect(catalogPath("Produto inválido."));
  const { user, workspace } = await requireWorkspace();
  const duplicate = await prisma.productCatalog.findFirst({
    where: {
      workspaceId: workspace.id,
      id: { not: productId },
      internalCode: { equals: parsed.data.internalCode, mode: "insensitive" }
    },
    select: { id: true }
  });
  if (duplicate) redirect(catalogPath("Já existe um produto com esse código."));
  const updated = await prisma.productCatalog.updateMany({
    where: { id: productId, workspaceId: workspace.id },
    data: parsed.data
  });
  if (!updated.count) redirect(catalogPath("Produto não encontrado."));
  await writeAudit("catalog_product_updated", user.id, workspace.id, {
    productCatalogId: productId
  });
  redirect(catalogPath("Produto atualizado."));
}

export async function toggleCatalogProduct(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const { user, workspace } = await requireWorkspace();
  const product = await prisma.productCatalog.findFirst({
    where: { id: productId, workspaceId: workspace.id },
    select: { active: true }
  });
  if (!product) redirect(catalogPath("Produto não encontrado."));
  await prisma.productCatalog.updateMany({
    where: { id: productId, workspaceId: workspace.id },
    data: { active: !product.active }
  });
  await writeAudit("catalog_product_status_changed", user.id, workspace.id, {
    productCatalogId: productId,
    active: String(!product.active)
  });
  redirect(
    catalogPath(product.active ? "Produto desativado." : "Produto ativado.")
  );
}

const aliasSchema = z
  .object({
    supplierCode: z.string().trim().max(120).optional(),
    supplierDescription: z.string().trim().max(500).optional(),
    productCatalogId: z.string().uuid(),
    supplierId: z.string().uuid().optional(),
    confidenceHint: z.coerce.number().min(0).max(1).optional()
  })
  .refine((data) => data.supplierCode || data.supplierDescription);

function aliasInput(formData: FormData) {
  return aliasSchema.safeParse({
    supplierCode: optional(formData.get("supplierCode")),
    supplierDescription: optional(formData.get("supplierDescription")),
    productCatalogId: formData.get("productCatalogId"),
    supplierId: optional(formData.get("supplierId")),
    confidenceHint: optional(formData.get("confidenceHint"))
  });
}

async function hasAliasConflict(
  workspaceId: string,
  data: z.infer<typeof aliasSchema>,
  ignoredId?: string
) {
  const aliases = await prisma.productAlias.findMany({
    where: {
      workspaceId,
      supplierId: data.supplierId ?? null,
      ...(ignoredId ? { id: { not: ignoredId } } : {})
    },
    select: { supplierCode: true, supplierDescription: true }
  });
  const code = normalizeProductText(data.supplierCode);
  const description = normalizeProductText(data.supplierDescription);
  return aliases.some(
    (alias) =>
      (code && normalizeProductText(alias.supplierCode) === code) ||
      (description &&
        normalizeProductText(alias.supplierDescription) === description)
  );
}

export async function createProductAlias(formData: FormData) {
  const parsed = aliasInput(formData);
  if (!parsed.success) redirect(catalogPath("Revise os dados do alias."));
  const { user, workspace } = await requireWorkspace();
  const [product, supplier] = await Promise.all([
    prisma.productCatalog.findFirst({
      where: { id: parsed.data.productCatalogId, workspaceId: workspace.id },
      select: { id: true }
    }),
    parsed.data.supplierId
      ? prisma.supplier.findFirst({
          where: { id: parsed.data.supplierId, workspaceId: workspace.id },
          select: { id: true }
        })
      : null
  ]);
  if (!product || (parsed.data.supplierId && !supplier))
    redirect(catalogPath("Produto ou fornecedor de destino inválido."));
  if (await hasAliasConflict(workspace.id, parsed.data))
    redirect(catalogPath("Já existe um alias com esses dados."));
  const alias = await prisma.productAlias.create({
    data: { workspaceId: workspace.id, ...parsed.data }
  });
  await writeAudit("product_alias_created", user.id, workspace.id, {
    productAliasId: alias.id,
    productCatalogId: product.id,
    supplierId: supplier?.id ?? "global"
  });
  redirect(catalogPath("Alias criado."));
}

export async function updateProductAlias(formData: FormData) {
  const aliasId = String(formData.get("aliasId") ?? "");
  const parsed = aliasInput(formData);
  if (!z.string().uuid().safeParse(aliasId).success || !parsed.success)
    redirect(catalogPath("Alias inválido."));
  const { user, workspace } = await requireWorkspace();
  const [product, supplier] = await Promise.all([
    prisma.productCatalog.findFirst({
      where: { id: parsed.data.productCatalogId, workspaceId: workspace.id },
      select: { id: true }
    }),
    parsed.data.supplierId
      ? prisma.supplier.findFirst({
          where: { id: parsed.data.supplierId, workspaceId: workspace.id },
          select: { id: true }
        })
      : null
  ]);
  if (!product || (parsed.data.supplierId && !supplier))
    redirect(catalogPath("Produto ou fornecedor de destino inválido."));
  if (await hasAliasConflict(workspace.id, parsed.data, aliasId))
    redirect(catalogPath("Já existe um alias com esses dados."));
  const updated = await prisma.productAlias.updateMany({
    where: { id: aliasId, workspaceId: workspace.id },
    data: parsed.data
  });
  if (!updated.count) redirect(catalogPath("Alias não encontrado."));
  await writeAudit("product_alias_updated", user.id, workspace.id, {
    productAliasId: aliasId,
    productCatalogId: product.id,
    supplierId: supplier?.id ?? "global"
  });
  redirect(catalogPath("Alias atualizado."));
}

export async function classifyInvoiceItem(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const productCatalogId = String(formData.get("productCatalogId") ?? "");
  const { user, workspace, process } = await requireProcess(processId);
  const [item, product] = await Promise.all([
    prisma.invoiceItem.findFirst({
      where: {
        id: itemId,
        importProcessId: processId,
        workspaceId: workspace.id
      }
    }),
    prisma.productCatalog.findFirst({
      where: { id: productCatalogId, workspaceId: workspace.id, active: true }
    })
  ]);
  if (!item || !product)
    redirect(processPath(processId, "Item ou produto inválido."));
  let aliasCreated = false;
  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.updateMany({
      where: {
        id: item.id,
        importProcessId: processId,
        workspaceId: workspace.id
      },
      data: { productCatalogId: product.id }
    });
    if (formData.get("createAlias") === "on") {
      const aliases = await tx.productAlias.findMany({
        where: { workspaceId: workspace.id, supplierId: process.supplierId },
        select: { supplierCode: true, supplierDescription: true }
      });
      const code = normalizeProductText(item.supplierCode);
      const description = normalizeProductText(item.description);
      const duplicate = aliases.some(
        (alias) =>
          (code && normalizeProductText(alias.supplierCode) === code) ||
          (description &&
            normalizeProductText(alias.supplierDescription) === description)
      );
      if (!duplicate && (code || description)) {
        await tx.productAlias.create({
          data: {
            workspaceId: workspace.id,
            productCatalogId: product.id,
            supplierId: process.supplierId,
            supplierCode: item.supplierCode,
            supplierDescription: item.description,
            confidenceHint: 1
          }
        });
        aliasCreated = true;
      }
    }
    await tx.inconsistency.updateMany({
      where: {
        workspaceId: workspace.id,
        importProcessId: processId,
        invoiceItemId: item.id,
        type: "CATALOG_NOT_FOUND",
        status: "OPEN"
      },
      data: {
        status: "RESOLVED",
        resolutionNote: "Classificação manual realizada."
      }
    });
  });
  await writeAudit("invoice_item_classified", user.id, workspace.id, {
    processId,
    invoiceItemId: item.id,
    productCatalogId: product.id,
    aliasCreated: String(aliasCreated)
  });
  redirect(
    processPath(
      processId,
      aliasCreated ? "Item classificado e alias criado." : "Item classificado."
    )
  );
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
  const supplierId = optional(formData.get("supplierId"));
  if (
    supplierId &&
    !(await prisma.supplier.findFirst({
      where: { id: supplierId, workspaceId: workspace.id, active: true },
      select: { id: true }
    }))
  )
    redirect("/workspace/processes?message=Fornecedor inválido.");
  const process = await prisma.importProcess.create({
    data: {
      workspaceId: workspace.id,
      createdById: user.id,
      supplierId,
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

export async function setProcessSupplier(formData: FormData) {
  const processId = String(formData.get("processId") ?? "");
  const supplierId = optional(formData.get("supplierId"));
  const { user, workspace } = await requireProcess(processId);
  if (
    supplierId &&
    !(await prisma.supplier.findFirst({
      where: { id: supplierId, workspaceId: workspace.id, active: true },
      select: { id: true }
    }))
  )
    redirect(processPath(processId, "Fornecedor inválido."));
  await prisma.importProcess.updateMany({
    where: { id: processId, workspaceId: workspace.id },
    data: { supplierId: supplierId ?? null }
  });
  await writeAudit("process_supplier_changed", user.id, workspace.id, {
    processId,
    supplierId: supplierId ?? "none"
  });
  redirect(processPath(processId, "Fornecedor do processo atualizado."));
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
  const { user, workspace, process } = await requireProcess(processId);
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
    drawback?.status === "DRAFT",
    process.supplierId
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
