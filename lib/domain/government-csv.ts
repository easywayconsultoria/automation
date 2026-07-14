const PORTAL_HEADERS = [
  "productCode",
  "description",
  "ncm",
  "registrationStatus"
] as const;
const DRAWBACK_HEADERS = [
  "referenceCode",
  "productCode",
  "ncm",
  "grantedQuantity",
  "usedQuantity",
  "availableBalance",
  "unit"
] as const;

function lineValues(line: string) {
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

function source(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  return { lines, header: lines.length ? lineValues(lines[0]) : [] };
}

export function parsePortalCsv(content: string) {
  const { lines, header } = source(content);
  const missing = PORTAL_HEADERS.filter((item) => !header.includes(item));
  if (missing.length)
    return {
      header,
      rows: [],
      errors: [
        { line: 1, message: `Cabeçalho incompleto: ${missing.join(", ")}.` }
      ]
    };
  const rows: Record<string, string | number | Record<string, string>>[] = [];
  const errors: { line: number; message: string }[] = [];
  lines.slice(1).forEach((line, index) => {
    const number = index + 2;
    const raw = Object.fromEntries(
      header.map((key, column) => [key, lineValues(line)[column] ?? ""])
    );
    if (!raw.productCode)
      errors.push({ line: number, message: "productCode obrigatório." });
    if (!raw.description)
      errors.push({ line: number, message: "description obrigatória." });
    if (!raw.registrationStatus)
      errors.push({ line: number, message: "registrationStatus obrigatório." });
    if (!errors.some((error) => error.line === number))
      rows.push({
        lineNumber: number,
        productCode: raw.productCode,
        description: raw.description,
        ncm: raw.ncm || "",
        registrationStatus: raw.registrationStatus.toUpperCase(),
        rawData: raw
      });
  });
  return { header, rows, errors };
}

export function parseDrawbackCsv(content: string) {
  const { lines, header } = source(content);
  const missing = DRAWBACK_HEADERS.filter((item) => !header.includes(item));
  if (missing.length)
    return {
      header,
      rows: [],
      errors: [
        { line: 1, message: `Cabeçalho incompleto: ${missing.join(", ")}.` }
      ]
    };
  const rows: Record<string, string | number | Record<string, string>>[] = [];
  const errors: { line: number; message: string }[] = [];
  lines.slice(1).forEach((line, index) => {
    const number = index + 2;
    const raw = Object.fromEntries(
      header.map((key, column) => [key, lineValues(line)[column] ?? ""])
    );
    if (!raw.referenceCode)
      errors.push({ line: number, message: "referenceCode obrigatório." });
    if (!raw.productCode)
      errors.push({ line: number, message: "productCode obrigatório." });
    for (const field of ["grantedQuantity", "usedQuantity", "availableBalance"])
      if (!Number.isFinite(Number(raw[field])))
        errors.push({ line: number, message: `${field} inválido.` });
    if (!errors.some((error) => error.line === number))
      rows.push({
        lineNumber: number,
        referenceCode: raw.referenceCode,
        productCode: raw.productCode,
        ncm: raw.ncm || "",
        grantedQuantity: Number(raw.grantedQuantity),
        usedQuantity: Number(raw.usedQuantity),
        availableBalance: Number(raw.availableBalance),
        unit: raw.unit || "",
        rawData: raw
      });
  });
  return { header, rows, errors };
}
