type Layout = {
  version: string;
  headers: string[];
  aliases: Record<string, string>;
};

export const PORTAL_LAYOUTS: Layout[] = [
  {
    version: "1.0",
    headers: ["productCode", "description", "ncm", "registrationStatus"],
    aliases: {}
  },
  {
    version: "0.9",
    headers: ["codigo_produto", "descricao", "ncm", "situacao_cadastro"],
    aliases: {
      codigo_produto: "productCode",
      descricao: "description",
      situacao_cadastro: "registrationStatus"
    }
  }
];
export const DRAWBACK_LAYOUTS: Layout[] = [
  {
    version: "1.0",
    headers: [
      "referenceCode",
      "productCode",
      "ncm",
      "grantedQuantity",
      "usedQuantity",
      "availableBalance",
      "unit"
    ],
    aliases: {}
  },
  {
    version: "0.9",
    headers: [
      "ato_concessorio",
      "codigo_produto",
      "ncm",
      "quantidade_concedida",
      "quantidade_utilizada",
      "saldo_disponivel",
      "unidade"
    ],
    aliases: {
      ato_concessorio: "referenceCode",
      codigo_produto: "productCode",
      quantidade_concedida: "grantedQuantity",
      quantidade_utilizada: "usedQuantity",
      saldo_disponivel: "availableBalance",
      unidade: "unit"
    }
  }
];

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
function detect(header: string[], layouts: Layout[]) {
  return layouts.find(
    (layout) =>
      layout.headers.length === header.length &&
      layout.headers.every((item, index) => item === header[index])
  );
}
function canonicalRaw(header: string[], values: string[], layout: Layout) {
  return Object.fromEntries(
    header.map((key, column) => [
      layout.aliases[key] ?? key,
      values[column] ?? ""
    ])
  );
}
function unknown(header: string[], layouts: Layout[]) {
  return {
    header,
    detectedVersion: null,
    rows: [],
    errors: [
      {
        line: 1,
        message: `Layout desconhecido. Cabeçalho recebido: ${header.join(", ") || "vazio"}. Versões aceitas: ${layouts.map((item) => item.version).join(", ")}.`
      }
    ]
  };
}

export function parsePortalCsv(content: string) {
  const { lines, header } = source(content);
  const layout = detect(header, PORTAL_LAYOUTS);
  if (!layout) return unknown(header, PORTAL_LAYOUTS);
  const rows: Record<string, string | number | Record<string, string>>[] = [];
  const errors: { line: number; message: string }[] = [];
  lines.slice(1).forEach((line, index) => {
    const number = index + 2;
    const raw = canonicalRaw(header, lineValues(line), layout);
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
  return { header, detectedVersion: layout.version, rows, errors };
}

export function parseDrawbackCsv(content: string) {
  const { lines, header } = source(content);
  const layout = detect(header, DRAWBACK_LAYOUTS);
  if (!layout) return unknown(header, DRAWBACK_LAYOUTS);
  const rows: Record<string, string | number | Record<string, string>>[] = [];
  const errors: { line: number; message: string }[] = [];
  lines.slice(1).forEach((line, index) => {
    const number = index + 2;
    const raw = canonicalRaw(header, lineValues(line), layout);
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
  return { header, detectedVersion: layout.version, rows, errors };
}
