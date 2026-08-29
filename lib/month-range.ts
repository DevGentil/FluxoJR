import { addMonths, currentMonthKey, startOfMonth, startOfNextMonth } from "@/lib/date-only";

/** Filtro de período das telas de repasse: "De"/"Até" no formato "YYYY-MM".
 * Vem da URL (?from=&to=) para ser compartilhável e sobreviver ao reload. */
export interface MonthRange {
  from: string;
  to: string;
}

export function parseMonthRange(params: { from?: string; to?: string }): MonthRange | null {
  return params.from && params.to ? { from: params.from, to: params.to } : null;
}

export function monthPresets() {
  const thisMonth = currentMonthKey();
  return [
    { label: "Este mês", from: thisMonth, to: thisMonth },
    { label: "Últimos 3 meses", from: addMonths(thisMonth, -2), to: thisMonth },
    { label: "Este ano", from: `${thisMonth.slice(0, 4)}-01`, to: thisMonth },
  ];
}

/** O filtro é por mês, mas os lançamentos são diários — então vira um
 * intervalo fechado no primeiro dia de "de" e aberto no primeiro dia do mês
 * seguinte a "até", para não cortar os últimos dias do mês final. Tudo em
 * UTC, como todas as datas de calendário do sistema (ver lib/date-only.ts). */
export function dateFilter(range: MonthRange | null) {
  if (!range) return undefined;
  if (!/^\d{4}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}$/.test(range.to)) return undefined;
  return { gte: startOfMonth(range.from), lt: startOfNextMonth(range.to) };
}
