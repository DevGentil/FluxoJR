/** Filtro de período das telas de repasse: "De"/"Até" no formato "YYYY-MM".
 * Vem da URL (?from=&to=) para ser compartilhável e sobreviver ao reload. */
export interface MonthRange {
  from: string;
  to: string;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthRange(params: { from?: string; to?: string }): MonthRange | null {
  return params.from && params.to ? { from: params.from, to: params.to } : null;
}

export function monthPresets() {
  const now = new Date();
  const thisMonth = monthKey(now);
  const threeMonthsAgo = monthKey(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const startOfYear = monthKey(new Date(now.getFullYear(), 0, 1));
  return [
    { label: "Este mês", from: thisMonth, to: thisMonth },
    { label: "Últimos 3 meses", from: threeMonthsAgo, to: thisMonth },
    { label: "Este ano", from: startOfYear, to: thisMonth },
  ];
}

/** O filtro é por mês, mas os lançamentos são diários — então vira um
 * intervalo fechado no primeiro dia de "de" e aberto no primeiro dia do mês
 * seguinte a "até", para não cortar os últimos dias do mês final. */
export function dateFilter(range: MonthRange | null) {
  if (!range) return undefined;
  const [toYear, toMonth] = range.to.split("-").map(Number);
  if (!toYear || !toMonth) return undefined;
  return { gte: new Date(`${range.from}-01T00:00:00`), lt: new Date(toYear, toMonth, 1) };
}
