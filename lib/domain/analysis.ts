import type { InvoiceItem, ProductAlias, ProductCatalog } from "@prisma/client";

type Finding = {
  invoiceItemId?: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
};
type Product = ProductCatalog & { aliases: ProductAlias[] };

export function analyzeProcess(
  items: InvoiceItem[],
  products: Product[],
  drawbackDraft: boolean
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
    const matched = products.some(
      (product) =>
        product.internalCode === item.supplierCode ||
        product.aliases.some(
          (alias) => alias.supplierCode === item.supplierCode
        )
    );
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
