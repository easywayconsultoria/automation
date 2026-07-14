import type { InvoiceItem, ProductAlias, ProductCatalog } from "@prisma/client";

type Finding = {
  invoiceItemId?: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
};
type Product = ProductCatalog & { aliases: ProductAlias[] };

export type MatchCriterion =
  | "MANUAL"
  | "SUPPLIER_ALIAS_CODE_DESCRIPTION"
  | "SUPPLIER_ALIAS_CODE"
  | "SUPPLIER_ALIAS_DESCRIPTION"
  | "GLOBAL_ALIAS_CODE_DESCRIPTION"
  | "GLOBAL_ALIAS_CODE"
  | "GLOBAL_ALIAS_DESCRIPTION"
  | "INTERNAL_CODE";

export function normalizeProductText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchInvoiceItem(
  item: InvoiceItem,
  products: Product[],
  supplierId?: string | null
) {
  const activeProducts = products.filter((product) => product.active);
  const manual = activeProducts.find(
    (product) => product.id === item.productCatalogId
  );
  if (manual) return { product: manual, criterion: "MANUAL" as const };

  const code = normalizeProductText(item.supplierCode);
  const description = normalizeProductText(item.description);
  const aliases = activeProducts.flatMap((product) =>
    product.aliases.map((alias) => ({ product, alias }))
  );
  const findAlias = (
    candidates: typeof aliases,
    criterionPrefix: "SUPPLIER" | "GLOBAL"
  ) => {
    const both = candidates.find(
      ({ alias }) =>
        code &&
        description &&
        normalizeProductText(alias.supplierCode) === code &&
        normalizeProductText(alias.supplierDescription) === description
    );
    if (both)
      return {
        product: both.product,
        criterion: `${criterionPrefix}_ALIAS_CODE_DESCRIPTION` as MatchCriterion
      };
    const byCode = candidates.find(
      ({ alias }) => code && normalizeProductText(alias.supplierCode) === code
    );
    if (byCode)
      return {
        product: byCode.product,
        criterion: `${criterionPrefix}_ALIAS_CODE` as MatchCriterion
      };
    const byDescription = candidates.find(
      ({ alias }) =>
        description &&
        normalizeProductText(alias.supplierDescription) === description
    );
    if (byDescription)
      return {
        product: byDescription.product,
        criterion: `${criterionPrefix}_ALIAS_DESCRIPTION` as MatchCriterion
      };
    return null;
  };
  if (supplierId) {
    const supplierMatch = findAlias(
      aliases.filter(({ alias }) => alias.supplierId === supplierId),
      "SUPPLIER"
    );
    if (supplierMatch) return supplierMatch;
  }
  const globalMatch = findAlias(
    aliases.filter(({ alias }) => !alias.supplierId),
    "GLOBAL"
  );
  if (globalMatch) return globalMatch;

  const byInternalCode = activeProducts.find(
    (product) => code && normalizeProductText(product.internalCode) === code
  );
  if (byInternalCode)
    return { product: byInternalCode, criterion: "INTERNAL_CODE" as const };
  return null;
}

export function analyzeProcess(
  items: InvoiceItem[],
  products: Product[],
  drawbackDraft: boolean,
  supplierId?: string | null
) {
  const findings: Finding[] = [];
  if (!items.length)
    findings.push({
      type: "PROCESS_WITHOUT_ITEMS",
      severity: "CRITICAL",
      title: "Processo sem itens",
      description: "Inclua os itens da invoice antes de concluir a conferência."
    });
  for (const item of items) {
    const base = { invoiceItemId: item.id };
    const matched = matchInvoiceItem(item, products, supplierId);
    if (!matched)
      findings.push({
        ...base,
        type: "CATALOG_NOT_FOUND",
        severity: "HIGH",
        title: "Produto sem correspondência",
        description: `O item ${item.lineNumber} não possui correspondência no catálogo.`
      });
    if (!item.ncm?.trim())
      findings.push({
        ...base,
        type: "NCM_MISSING",
        severity: "HIGH",
        title: "NCM ausente",
        description: `Informe o NCM do item ${item.lineNumber}.`
      });
    if (item.quantity.lte(0))
      findings.push({
        ...base,
        type: "INVALID_QUANTITY",
        severity: "CRITICAL",
        title: "Quantidade inválida",
        description: `A quantidade do item ${item.lineNumber} deve ser maior que zero.`
      });
    if (item.unitPrice.lte(0) || item.totalPrice.lte(0))
      findings.push({
        ...base,
        type: "INVALID_PRICE",
        severity: "CRITICAL",
        title: "Preço inválido",
        description: `Preços do item ${item.lineNumber} devem ser maiores que zero.`
      });
    const expected = item.quantity.mul(item.unitPrice);
    if (expected.sub(item.totalPrice).abs().gt(0.02))
      findings.push({
        ...base,
        type: "TOTAL_DIVERGENCE",
        severity: "HIGH",
        title: "Total divergente",
        description: `Quantidade × preço unitário diverge do total no item ${item.lineNumber}.`
      });
    if (item.description.trim().length < 5)
      findings.push({
        ...base,
        type: "DESCRIPTION_TOO_SHORT",
        severity: "MEDIUM",
        title: "Descrição insuficiente",
        description: `Detalhe melhor a descrição do item ${item.lineNumber}.`
      });
  }
  if (
    drawbackDraft &&
    findings.some((finding) => finding.severity === "CRITICAL")
  )
    findings.push({
      type: "DRAWBACK_CRITICAL_OPEN",
      severity: "CRITICAL",
      title: "Drawback bloqueado por inconsistências",
      description:
        "O drawback em rascunho possui inconsistências críticas abertas."
    });
  return findings;
}

export function actionForFinding(finding: Finding) {
  const priority =
    finding.severity === "CRITICAL" || finding.severity === "HIGH"
      ? "HIGH"
      : finding.severity === "MEDIUM"
        ? "MEDIUM"
        : "LOW";
  return {
    title: finding.title,
    description: finding.description,
    priority
  } as const;
}
