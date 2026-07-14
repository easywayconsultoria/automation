export const CSV_HEADERS = [
  "lineNumber",
  "supplierCode",
  "description",
  "ncm",
  "quantity",
  "unit",
  "unitPrice",
  "totalPrice",
  "grossWeight",
  "netWeight",
  "currency",
  "countryOfOrigin"
] as const;
type CsvRow = Record<(typeof CSV_HEADERS)[number], string>;

function parseLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += char;
  }
  values.push(value.trim());
  return values;
}

export function parseInvoiceCsv(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length)
    return { rows: [] as CsvRow[], errors: ["O arquivo está vazio."] };
  const headers = parseLine(lines[0]);
  const missing = CSV_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length)
    return {
      rows: [] as CsvRow[],
      errors: [`Cabeçalho incompleto: ${missing.join(", ")}.`]
    };
  const rows: CsvRow[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, index) => {
    const values = parseLine(line);
    const raw = Object.fromEntries(
      headers.map((header, column) => [header, values[column] ?? ""])
    ) as CsvRow;
    const number = index + 2;
    if (!Number.isInteger(Number(raw.lineNumber)) || Number(raw.lineNumber) < 1)
      errors.push(`Linha ${number}: lineNumber inválido.`);
    if (!raw.description)
      errors.push(`Linha ${number}: description obrigatória.`);
    for (const field of ["quantity", "unitPrice", "totalPrice"] as const)
      if (!Number.isFinite(Number(raw[field])))
        errors.push(`Linha ${number}: ${field} inválido.`);
    if (!errors.some((error) => error.startsWith(`Linha ${number}:`)))
      rows.push(raw);
  });
  return { rows, errors };
}
