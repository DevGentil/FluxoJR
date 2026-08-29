/** Vocabulário de períodos: como um mês vira trimestre, semestre ou ano, e
 * como cada um se chama.
 *
 * Um lugar só porque eram dois: as Métricas de Custo tinham a sua conta de
 * qual trimestre é qual, e o comparativo do Balanço tinha outra — mesmas
 * chaves, rótulos diferentes ("1º trimestre de 2026" contra "1º tri/26"),
 * e nada garantindo que continuassem concordando.
 *
 * Módulo PURO, sem banco. Não é capricho: os dois consumidores são Client
 * Components, e importar daqui algo que puxasse `lib/prisma` levaria o
 * driver do Postgres para o bundle do navegador. O `tsc` não pega isso; só
 * o build reclama. */
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

/** Os botões de granularidade, na ordem em que aparecem. */
export const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "month", label: "Mensal" },
  { value: "quarter", label: "Trimestral" },
  { value: "semester", label: "Semestral" },
  { value: "year", label: "Anual" },
];

const MESES_LONGOS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Quão comprido é o rótulo. `curto` cabe no eixo de um gráfico ("3º
 * tri/26"); `longo` é para o cabeçalho de uma linha de tabela ("3º
 * trimestre de 2026"). */
export type LabelFormat = "curto" | "longo";

/** A que período um mês ("YYYY-MM") pertence, e como ele se chama. A chave é
 * ordenável alfabeticamente, que é o que permite ordenar sem reconverter
 * para data. */
export function periodOf(
  month: string,
  granularity: Granularity,
  formato: LabelFormat = "curto"
): { key: string; label: string } {
  const [ano, mes] = month.split("-").map(Number);
  const curto = formato === "curto";
  const aa = String(ano).slice(2);

  switch (granularity) {
    case "month":
      return {
        key: month,
        label: curto ? `${MESES_CURTOS[mes - 1]}/${aa}` : `${MESES_LONGOS[mes - 1]} de ${ano}`,
      };
    case "quarter": {
      const t = Math.floor((mes - 1) / 3) + 1;
      return { key: `${ano}-Q${t}`, label: curto ? `${t}º tri/${aa}` : `${t}º trimestre de ${ano}` };
    }
    case "semester": {
      const s = Math.floor((mes - 1) / 6) + 1;
      return { key: `${ano}-S${s}`, label: curto ? `${s}º sem/${aa}` : `${s}º semestre de ${ano}` };
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
    const { key, label } = periodOf(m.month, granularity);
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
