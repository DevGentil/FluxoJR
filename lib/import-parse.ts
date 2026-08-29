import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, unknown>[];
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedFile> {
  const isCsv = file.name.toLowerCase().endsWith(".csv");

  if (isCsv) {
    const text = await file.text();
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    const headers = result.meta.fields ?? [];
    return { headers, rows: result.data };
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" pelos componentes locais do Date. */
function localDateOnly(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Converte valores de data em texto (dd/mm/yyyy, yyyy-mm-dd) ou objetos Date em ISO (yyyy-mm-dd). */
export function normalizeDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    // Componentes locais, não `toISOString()`: a planilha entrega a data na
    // meia-noite do fuso de quem importa, e converter para UTC devolveria o
    // dia anterior em qualquer fuso a leste de Greenwich.
    return localDateOnly(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (brMatch) {
      const [, d, m, y] = brMatch;
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return localDateOnly(parsed);
  }
  if (typeof value === "number") {
    // Excel serial date fallback.
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  return null;
}

/** Decide se o ponto de um valor SEM vírgula é separador de milhar (padrão
 * brasileiro, "12.500") ou separador decimal (padrão americano, "12.5").
 *
 * Vale a regra do extrato: valor em real tem duas casas decimais, então um
 * ponto seguido de exatamente três dígitos é milhar. Sem isso, "12.500"
 * entrava como R$ 12,50 e "1.234.567" era descartado como inválido. */
function dotIsThousandsSeparator(cleaned: string): boolean {
  const dots = cleaned.split(".").length - 1;
  if (dots > 1) return true; // "1.234.567" só faz sentido como milhar

  const match = cleaned.match(/^-?(\d+)\.(\d+)$/);
  if (!match) return false;
  const [, inteiro, decimais] = match;
  // "0.500" é decimal: ninguém escreve zero como parte inteira de um milhar.
  return decimais.length === 3 && inteiro !== "0";
}

/** Converte valores monetários em texto (R$ 1.234,56 / 1234.56 / -50) em número. */
export function normalizeAmount(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  let cleaned = value.trim().replace(/[R$\s]/g, "");
  if (cleaned === "") return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma) {
    // Com vírgula, ela é a decimal e o ponto é milhar — padrão brasileiro.
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasDot && dotIsThousandsSeparator(cleaned)) {
    cleaned = cleaned.replace(/\./g, "");
  }

  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}
