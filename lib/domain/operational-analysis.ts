import { normalizeProductText } from "@/lib/domain/analysis";

type JsonObject = Record<string, unknown>;

type ProcessItem = {
  id: string;
  lineNumber: number;
  supplierCode: string | null;
  description: string;
  ncm: string | null;
  quantity: unknown;
  unitPrice: unknown;
  totalPrice: unknown;
};

type OperationalDocument = {
  id: string;
  fileName: string;
  type: string;
  status: string;
  processingSummary: unknown;
};

type PortalRow = {
  productCode: string;
  registrationStatus: string;
};

type DrawbackRow = {
  productCode: string;
  availableBalance: unknown;
};

export type OperationalFinding = {
  invoiceItemId?: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  source: {
    documentId?: string;
    documentName?: string;
    documentLine?: number;
    processLine?: number;
    criterion: string;
  };
  suggestedAction: {
    type: string;
    title: string;
    description: string;
  };
};

type DocumentItem = {
  key: string;
  documentId: string;
  documentName: string;
  line?: number;
  code?: string;
  description?: string;
  ncm?: string;
  quantity?: number;
  unitPrice?: number;
  totalValue?: number;
};

const OPERATIONAL_TYPES = new Set([
  "INVOICE",
  "XLSX_OPERATIONAL",
  "XML_OPERATIONAL"
]);

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function number(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function string(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = String(value).trim();
  return parsed || undefined;
}

function normalizedKey(value: string) {
  return normalizeProductText(value).replaceAll(" ", "");
}

function field(row: JsonObject, aliases: string[]) {
  const entries = Object.entries(row);
  const match = entries.find(([key]) => aliases.includes(normalizedKey(key)));
  return match?.[1];
}

const aliases = {
  code: ["CODIGO", "CODE", "CPROD", "PRODUCTCODE", "CODIGOPRODUTO"],
  description: ["DESCRICAO", "DESCRIPTION", "XPROD", "PRODUTO", "PRODUCT"],
  ncm: ["NCM"],
  quantity: ["QUANTIDADE", "QUANTITY", "QCOM", "QTD"],
  unitPrice: [
    "VALORUNITARIO",
    "UNITPRICE",
    "VUNCOM",
    "PREC UNITARIO".replaceAll(" ", "")
  ],
  totalValue: ["VALOR", "VALUE", "VPROD", "TOTAL", "TOTALPRICE", "VALORTOTAL"],
  line: ["_ROW", "LINE", "LINHA", "NITEM"]
};

function documentItem(
  row: unknown,
  document: OperationalDocument,
  fallbackLine: number
): DocumentItem | null {
  const data = object(row);
  if (!data) return null;
  const code = string(field(data, aliases.code));
  const description = string(field(data, aliases.description));
  const ncm = string(field(data, aliases.ncm));
  const quantity = number(field(data, aliases.quantity));
  const unitPrice = number(field(data, aliases.unitPrice));
  const totalValue = number(field(data, aliases.totalValue));
  const line = number(field(data, aliases.line)) ?? fallbackLine;
  if (
    !code &&
    !description &&
    quantity === undefined &&
    totalValue === undefined
  )
    return null;
  return {
    key: `${document.id}:${line}`,
    documentId: document.id,
    documentName: document.fileName,
    line,
    code,
    description,
    ncm,
    quantity,
    unitPrice,
    totalValue
  };
}

function extractDocumentItems(document: OperationalDocument) {
  const summary = object(document.processingSummary);
  if (!summary) return [];
  const direct = Array.isArray(summary.items) ? summary.items : [];
  const sheetRows = Array.isArray(summary.sheets)
    ? summary.sheets.flatMap((sheet) => {
        const data = object(sheet);
        return data && Array.isArray(data.rows) ? data.rows : [];
      })
    : [];
  return [...direct, ...sheetRows]
    .map((row, index) => documentItem(row, document, index + 1))
    .filter((item): item is DocumentItem => Boolean(item));
}

function similarity(left?: string | null, right?: string | null) {
  const leftTokens = new Set(
    normalizeProductText(left).split(" ").filter(Boolean)
  );
  const rightTokens = new Set(
    normalizeProductText(right).split(" ").filter(Boolean)
  );
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token)
  );
  return intersection.length / new Set([...leftTokens, ...rightTokens]).size;
}

function matchDocumentItem(item: ProcessItem, documents: DocumentItem[]) {
  const code = normalizeProductText(item.supplierCode);
  const byCode = documents.find(
    (candidate) => code && normalizeProductText(candidate.code) === code
  );
  if (byCode) return { item: byCode, criterion: "EXACT_PRODUCT_CODE" };
  const description = normalizeProductText(item.description);
  const byDescription = documents.find(
    (candidate) =>
      description && normalizeProductText(candidate.description) === description
  );
  if (byDescription)
    return { item: byDescription, criterion: "EXACT_NORMALIZED_DESCRIPTION" };
  return null;
}

function finding(
  input: Omit<OperationalFinding, "suggestedAction"> & {
    actionTitle: string;
  }
): OperationalFinding {
  return {
    invoiceItemId: input.invoiceItemId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    description: input.description,
    source: input.source,
    suggestedAction: {
      type: `${input.type}:${input.invoiceItemId ?? input.source.documentId ?? "PROCESS"}`,
      title: input.actionTitle,
      description: `${input.description} Critério determinístico: ${input.source.criterion}.`
    }
  };
}

export function analyzeOperationalDocuments(input: {
  process: {
    invoiceNumber: string | null;
    exporterName: string | null;
    clientName: string;
  };
  items: ProcessItem[];
  documents: OperationalDocument[];
  portalRows: PortalRow[];
  drawbackRows: DrawbackRow[];
}) {
  const documents = input.documents.filter(
    (document) =>
      OPERATIONAL_TYPES.has(document.type) &&
      ["PARSED", "REVIEWED"].includes(document.status)
  );
  const documentItems = documents.flatMap(extractDocumentItems);
  const findings: OperationalFinding[] = [];
  const matchedDocumentItems = new Set<string>();

  for (const processItem of input.items) {
    const matched = matchDocumentItem(
      processItem,
      documentItems.filter((item) => !matchedDocumentItems.has(item.key))
    );
    if (!matched) {
      findings.push(
        finding({
          invoiceItemId: processItem.id,
          type: "DOCUMENT_ITEM_MISSING",
          severity: "HIGH",
          title: "Item sem documento correspondente",
          description: `O item ${processItem.lineNumber} (${processItem.supplierCode ?? processItem.description}) não foi localizado nos documentos estruturados.`,
          source: {
            processLine: processItem.lineNumber,
            criterion: "NO_EXACT_CODE_OR_DESCRIPTION_MATCH"
          },
          actionTitle: `Revisar documento do item ${processItem.lineNumber}`
        })
      );
    } else {
      const documentItem = matched.item;
      matchedDocumentItems.add(documentItem.key);
      const source = {
        documentId: documentItem.documentId,
        documentName: documentItem.documentName,
        documentLine: documentItem.line,
        processLine: processItem.lineNumber,
        criterion: matched.criterion
      };
      if (
        documentItem.quantity !== undefined &&
        Math.abs(Number(processItem.quantity) - documentItem.quantity) >
          0.000001
      )
        findings.push(
          finding({
            invoiceItemId: processItem.id,
            type: "DOCUMENT_QUANTITY_DIVERGENCE",
            severity: "HIGH",
            title: "Quantidade divergente no documento",
            description: `Item ${processItem.lineNumber}: processo ${String(processItem.quantity)}, documento ${documentItem.quantity}.`,
            source,
            actionTitle: `Revisar quantidade do item ${processItem.lineNumber}`
          })
        );
      if (
        documentItem.ncm &&
        processItem.ncm &&
        normalizedKey(documentItem.ncm) !== normalizedKey(processItem.ncm)
      )
        findings.push(
          finding({
            invoiceItemId: processItem.id,
            type: "DOCUMENT_NCM_DIVERGENCE",
            severity: "HIGH",
            title: "NCM divergente no documento",
            description: `Item ${processItem.lineNumber}: processo ${processItem.ncm}, documento ${documentItem.ncm}.`,
            source,
            actionTitle: `Revisar NCM do item ${processItem.lineNumber}`
          })
        );
      if (
        documentItem.description &&
        similarity(processItem.description, documentItem.description) < 0.6
      )
        findings.push(
          finding({
            invoiceItemId: processItem.id,
            type: "DOCUMENT_DESCRIPTION_DIVERGENCE",
            severity: "MEDIUM",
            title: "Descrição divergente no documento",
            description: `A descrição do item ${processItem.lineNumber} difere materialmente da linha ${documentItem.line} de ${documentItem.documentName}.`,
            source: {
              ...source,
              criterion: `${matched.criterion}+TOKEN_SIMILARITY_LT_0.60`
            },
            actionTitle: `Revisar descrição do item ${processItem.lineNumber}`
          })
        );
      const expectedValue = Number(processItem.totalPrice);
      if (
        documentItem.totalValue !== undefined &&
        Math.abs(expectedValue - documentItem.totalValue) > 0.02
      )
        findings.push(
          finding({
            invoiceItemId: processItem.id,
            type: "DOCUMENT_VALUE_DIVERGENCE",
            severity: "HIGH",
            title: "Valor divergente no documento",
            description: `Item ${processItem.lineNumber}: total do processo ${expectedValue}, documento ${documentItem.totalValue}.`,
            source,
            actionTitle: `Revisar valor do item ${processItem.lineNumber}`
          })
        );
    }

    const code = normalizeProductText(processItem.supplierCode);
    const portal = input.portalRows.find(
      (row) => normalizeProductText(row.productCode) === code
    );
    if (
      code &&
      (!portal ||
        !["REGISTERED", "ATIVO", "CADASTRADO"].includes(
          portal.registrationStatus.toUpperCase()
        ))
    )
      findings.push(
        finding({
          invoiceItemId: processItem.id,
          type: "PORTAL_REGISTRATION_GAP",
          severity: "HIGH",
          title: "Item sem cadastro ativo no Portal Único",
          description: `O código ${processItem.supplierCode} do item ${processItem.lineNumber} não possui cadastro ativo confirmado.`,
          source: {
            processLine: processItem.lineNumber,
            criterion: portal
              ? "PORTAL_STATUS_NOT_ACTIVE"
              : "PORTAL_CODE_NOT_FOUND"
          },
          actionTitle: `Revisar cadastro de ${processItem.supplierCode}`
        })
      );

    const drawback = input.drawbackRows.find(
      (row) => normalizeProductText(row.productCode) === code
    );
    if (
      code &&
      (!drawback ||
        Number(drawback.availableBalance) < Number(processItem.quantity))
    )
      findings.push(
        finding({
          invoiceItemId: processItem.id,
          type: "DRAWBACK_COVERAGE_GAP",
          severity: "HIGH",
          title: "Cobertura de drawback insuficiente",
          description: `O item ${processItem.lineNumber} exige ${String(processItem.quantity)}; saldo disponível ${drawback ? String(drawback.availableBalance) : "não localizado"}.`,
          source: {
            processLine: processItem.lineNumber,
            criterion: drawback
              ? "AVAILABLE_BALANCE_LT_REQUIRED_QUANTITY"
              : "DRAWBACK_CODE_NOT_FOUND"
          },
          actionTitle: `Revisar cobertura do item ${processItem.lineNumber}`
        })
      );
  }

  for (const item of documentItems.filter(
    (documentItem) => !matchedDocumentItems.has(documentItem.key)
  ))
    findings.push(
      finding({
        type: "DOCUMENT_ITEM_ORPHAN",
        severity: "MEDIUM",
        title: "Linha documental sem item no processo",
        description: `${item.documentName}, linha ${item.line}: ${item.code ?? item.description ?? "item"} não possui item correspondente no processo.`,
        source: {
          documentId: item.documentId,
          documentName: item.documentName,
          documentLine: item.line,
          criterion: "NO_EXACT_CODE_OR_DESCRIPTION_MATCH"
        },
        actionTitle: `Revisar linha ${item.line} de ${item.documentName}`
      })
    );

  for (const document of documents) {
    const summary = object(document.processingSummary);
    if (!summary) continue;
    const identifier = string(summary.identifier);
    const issuer = string(summary.issuer);
    const recipient = string(summary.recipient);
    if (
      identifier &&
      input.process.invoiceNumber &&
      normalizeProductText(identifier) !==
        normalizeProductText(input.process.invoiceNumber)
    )
      findings.push(
        finding({
          type: "DOCUMENT_IDENTIFIER_DIVERGENCE",
          severity: "HIGH",
          title: "Identificador de invoice divergente",
          description: `${document.fileName}: identificador ${identifier}; processo ${input.process.invoiceNumber}.`,
          source: {
            documentId: document.id,
            documentName: document.fileName,
            criterion: "NORMALIZED_IDENTIFIER_MISMATCH"
          },
          actionTitle: "Revisar número da invoice"
        })
      );
    if (
      issuer &&
      input.process.exporterName &&
      similarity(issuer, input.process.exporterName) < 0.6
    )
      findings.push(
        finding({
          type: "DOCUMENT_ISSUER_DIVERGENCE",
          severity: "MEDIUM",
          title: "Emitente divergente",
          description: `${document.fileName}: emitente ${issuer}; processo ${input.process.exporterName}.`,
          source: {
            documentId: document.id,
            documentName: document.fileName,
            criterion: "TOKEN_SIMILARITY_LT_0.60"
          },
          actionTitle: "Revisar emitente da invoice"
        })
      );
    if (recipient && similarity(recipient, input.process.clientName) < 0.6)
      findings.push(
        finding({
          type: "DOCUMENT_RECIPIENT_DIVERGENCE",
          severity: "MEDIUM",
          title: "Destinatário divergente",
          description: `${document.fileName}: destinatário ${recipient}; processo ${input.process.clientName}.`,
          source: {
            documentId: document.id,
            documentName: document.fileName,
            criterion: "TOKEN_SIMILARITY_LT_0.60"
          },
          actionTitle: "Revisar destinatário da invoice"
        })
      );
  }

  return {
    documentsAnalyzed: documents.length,
    documentItems: documentItems.length,
    matchedItems: matchedDocumentItems.size,
    unmatchedProcessItems: findings.filter(
      (item) => item.type === "DOCUMENT_ITEM_MISSING"
    ).length,
    orphanDocumentItems: findings.filter(
      (item) => item.type === "DOCUMENT_ITEM_ORPHAN"
    ).length,
    findings,
    sources: documents.map((document) => ({
      documentId: document.id,
      name: document.fileName,
      effectiveType: document.type
    }))
  };
}
