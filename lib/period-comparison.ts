/** Agrupamento de períodos — módulo PURO, sem banco.
 *
 * Vive separado da consulta de propósito: o comparativo do Balanço é um
 * Client Component, e importar daqui algo que puxasse `lib/prisma` levaria
 * o driver do Postgres para o bundle do navegador. O `tsc` não pega isso;
 * só o build reclama.
 */
export type Granularity = "month" | "quarter" | "semester" | "year";

export interface PeriodTotals {
  /** Chave ordenável: "2026-08", "2026-Q3", "2026-S2", "2026". */
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface MonthTotals {
  month: string;
  income: number;
  expense: number;
}

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Quantos meses cada granularidade agrupa. */
const TAMANHO: Record<Granularity, number> = { month: 1, quarter: 3, semester: 6, year: 12 };

/** A que período um mês pertence, e como ele se chama. */
function periodoDe(month: string, granularity: Granularity) {
  const [ano, mes] = month.split("-").map(Number);
  switch (granularity) {
    case "month":
      return { key: month, label: `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}` };
    case "quarter": {
      const t = Math.floor((mes - 1) / 3) + 1;
      return { key: `${ano}-Q${t}`, label: `${t}º tri/${String(ano).slice(2)}` };
    }
    case "semester": {
      const s = Math.floor((mes - 1) / 6) + 1;
      return { key: `${ano}-S${s}`, label: `${s}º sem/${String(ano).slice(2)}` };
    }
    case "year":
      return { key: String(ano), label: String(ano) };
  }
}

/** Agrupa os totais mensais na granularidade pedida, do mais antigo para o
 * mais recente. Separado da consulta para poder ser testado sem banco: uma
 * mesma leitura de meses alimenta as quatro visões, sem ir ao banco de novo
 * a cada troca de granularidade. */
export function groupByPeriod(months: MonthTotals[], granularity: Granularity): PeriodTotals[] {
  const map = new Map<string, PeriodTotals>();

  for (const m of months) {
    const { key, label } = periodoDe(m.month, granularity);
    const atual = map.get(key) ?? { key, label, income: 0, expense: 0, net: 0 };
    atual.income += m.income;
    atual.expense += m.expense;
    atual.net = atual.income - atual.expense;
    map.set(key, atual);
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Quantos meses de histórico buscar para encher `periodos` períodos da
 * granularidade pedida — mais um período de folga, para o primeiro da série
 * ter com o que ser comparado. */
export function mesesNecessarios(granularity: Granularity, periodos: number) {
  return TAMANHO[granularity] * (periodos + 1);
}
