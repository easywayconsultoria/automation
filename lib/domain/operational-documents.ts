import ExcelJS from "exceljs";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type OperationalDocumentResult = {
  detectedType: "XLSX_OPERATIONAL" | "XML_OPERATIONAL";
  status: "PARSED" | "PENDING_CLASSIFICATION" | "FAILED";
  summary: Record<string, unknown>;
  errors: Array<{ location?: string; message: string }>;
};

const MAX_ROWS = 500;
const MAX_XML_ITEMS = 500;

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
  if ("text" in value) return String(value.text);
  if ("richText" in value)
    return value.richText.map((part) => part.text).join("");
  return String(value);
}

export async function parseOperationalXlsx(
  buffer: Buffer
): Promise<OperationalDocumentResult> {
  const errors: OperationalDocumentResult["errors"] = [];
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheets: Array<Record<string, unknown>> = [];
    for (const worksheet of workbook.worksheets) {
      const rows: Array<Record<string, unknown>> = [];
      const headerRow = worksheet.getRow(1);
      const headers = Array.from({ length: headerRow.cellCount }, (_, index) =>
        String(cellValue(headerRow.getCell(index + 1).value) ?? "").trim()
      );
      const duplicateHeaders = headers.filter(
        (header, index) => header && headers.indexOf(header) !== index
      );
      if (!headers.some(Boolean)) {
        errors.push({
          location: worksheet.name,
          message: "A planilha não possui cabeçalho na primeira linha."
        });
      }
      if (duplicateHeaders.length)
        errors.push({
          location: worksheet.name,
          message: `Cabeçalhos duplicados: ${[...new Set(duplicateHeaders)].join(", ")}.`
        });
      for (
        let rowNumber = 2;
        rowNumber <= worksheet.actualRowCount && rows.length < MAX_ROWS;
        rowNumber += 1
      ) {
        const row = worksheet.getRow(rowNumber);
        const values = headers.map((_, index) =>
          cellValue(row.getCell(index + 1).value)
        );
        if (values.every((value) => value === null || value === "")) continue;
        if (
          row.cellCount > headers.length &&
          Array.from({ length: row.cellCount - headers.length }, (_, index) =>
            cellValue(row.getCell(headers.length + index + 1).value)
          ).some((value) => value !== null && value !== "")
        )
          errors.push({
            location: `${worksheet.name}, linha ${rowNumber}`,
            message: "A linha possui colunas além do cabeçalho declarado."
          });
        const item: Record<string, unknown> = { _row: rowNumber };
        headers.forEach((header, index) => {
          item[header || `column_${index + 1}`] = values[index];
        });
        rows.push(item);
      }
      sheets.push({
        name: worksheet.name,
        state: worksheet.state,
        headers,
        rowCount: Math.max(worksheet.actualRowCount - 1, 0),
        rows,
        truncated: Math.max(worksheet.actualRowCount - 1, 0) > MAX_ROWS
      });
    }
    const operationalHeaders = new Set([
      "codigo",
      "code",
      "produto",
      "product",
      "descricao",
      "description",
      "ncm",
      "quantidade",
      "quantity",
      "valor",
      "value",
      "invoice"
    ]);
    const usable = sheets.some(
      (sheet) =>
        Array.isArray(sheet.headers) &&
        sheet.headers.filter((header) =>
          operationalHeaders.has(
            String(header)
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim()
              .toLowerCase()
          )
        ).length >= 2 &&
        Number(sheet.rowCount) > 0
    );
    if (!workbook.worksheets.length)
      errors.push({ message: "O arquivo não contém planilhas legíveis." });
    else if (!usable)
      errors.push({
        message:
          "XLSX lido, porém os cabeçalhos não correspondem a uma estrutura operacional reconhecida."
      });
    return {
      detectedType: "XLSX_OPERATIONAL",
      status: usable ? "PARSED" : "PENDING_CLASSIFICATION",
      summary: {
        format: "xlsx",
        activeSheet: workbook.worksheets.find(
          (sheet) => sheet.state === "visible"
        )?.name,
        sheetCount: workbook.worksheets.length,
        sheets
      },
      errors
    };
  } catch (error) {
    return {
      detectedType: "XLSX_OPERATIONAL",
      status: "FAILED",
      summary: { format: "xlsx" },
      errors: [
        {
          message:
            error instanceof Error
              ? error.message
              : "XLSX inválido ou corrompido."
        }
      ]
    };
  }
}

function arrayOf<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function localName(value: string) {
  return value.split(":").pop() ?? value;
}

function findKey(value: Record<string, unknown>, wanted: string) {
  return Object.keys(value).find(
    (key) => localName(key).toLowerCase() === wanted.toLowerCase()
  );
}

function child(value: unknown, wanted: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const key = findKey(value as Record<string, unknown>, wanted);
  return key ? (value as Record<string, unknown>)[key] : undefined;
}

function xmlScalar(value: unknown): string | number | boolean | null {
  if (["string", "number", "boolean"].includes(typeof value))
    return value as string | number | boolean;
  return null;
}

export function parseOperationalXml(buffer: Buffer): OperationalDocumentResult {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const validation = XMLValidator.validate(text);
  if (validation !== true)
    return {
      detectedType: "XML_OPERATIONAL",
      status: "FAILED",
      summary: { format: "xml" },
      errors: [
        {
          location: `linha ${validation.err.line}, coluna ${validation.err.col}`,
          message: validation.err.msg
        }
      ]
    };
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: true,
      trimValues: true
    });
    const parsed = parser.parse(text) as Record<string, unknown>;
    const rootKey = Object.keys(parsed).find((key) => !key.startsWith("?"));
    if (!rootKey) throw new Error("XML sem elemento raiz operacional.");
    const root = parsed[rootKey];
    const rootName = localName(rootKey);
    const nfe = child(root, "NFe") ?? (rootName === "NFe" ? root : undefined);
    const infNfe = child(nfe, "infNFe");
    const ide = child(infNfe, "ide");
    const emit = child(infNfe, "emit");
    const dest = child(infNfe, "dest");
    const details = arrayOf(child(infNfe, "det"));
    const genericItems = arrayOf(
      child(root, "items") ?? child(root, "Itens") ?? child(root, "lineItems")
    ).flatMap((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? arrayOf(
            child(entry, "item") ?? child(entry, "Item") ?? child(entry, "line")
          )
        : [entry]
    );
    const sourceItems = details.length ? details : genericItems;
    const items = sourceItems.slice(0, MAX_XML_ITEMS).map((entry, index) => {
      const product = child(entry, "prod") ?? entry;
      return {
        line: xmlScalar(child(entry, "@_nItem")) ?? index + 1,
        code: xmlScalar(child(product, "cProd") ?? child(product, "code")),
        description: xmlScalar(
          child(product, "xProd") ?? child(product, "description")
        ),
        ncm: xmlScalar(child(product, "NCM") ?? child(product, "ncm")),
        quantity: xmlScalar(
          child(product, "qCom") ?? child(product, "quantity")
        ),
        unit: xmlScalar(child(product, "uCom") ?? child(product, "unit")),
        value: xmlScalar(child(product, "vProd") ?? child(product, "value"))
      };
    });
    const recognizedRoots = new Set([
      "nfeproc",
      "nfe",
      "invoice",
      "commercialinvoice",
      "importdocument",
      "declaration"
    ]);
    const recognized =
      recognizedRoots.has(rootName.toLowerCase()) || Boolean(infNfe);
    const rootObject =
      root && typeof root === "object" && !Array.isArray(root)
        ? (root as Record<string, unknown>)
        : {};
    return {
      detectedType: "XML_OPERATIONAL",
      status: recognized ? "PARSED" : "PENDING_CLASSIFICATION",
      summary: {
        format: "xml",
        root: rootName,
        recognized,
        topLevelNodes: Object.keys(rootObject).slice(0, 40).map(localName),
        identifier:
          xmlScalar(child(infNfe, "@_Id")) ??
          xmlScalar(child(ide, "nNF")) ??
          xmlScalar(child(root, "id")),
        issuer:
          xmlScalar(child(emit, "xNome")) ?? xmlScalar(child(root, "supplier")),
        recipient:
          xmlScalar(child(dest, "xNome")) ?? xmlScalar(child(root, "customer")),
        itemCount: sourceItems.length,
        items,
        truncated: sourceItems.length > MAX_XML_ITEMS
      },
      errors: recognized
        ? []
        : [
            {
              location: rootName,
              message:
                "XML válido, porém o elemento raiz não corresponde a um documento operacional conhecido."
            }
          ]
    };
  } catch (error) {
    return {
      detectedType: "XML_OPERATIONAL",
      status: "FAILED",
      summary: { format: "xml" },
      errors: [
        {
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível ler o XML."
        }
      ]
    };
  }
}

export async function parseOperationalDocument(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx") return parseOperationalXlsx(buffer);
  if (ext === "xml") return parseOperationalXml(buffer);
  return null;
}
