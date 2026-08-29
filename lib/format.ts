/** Formatação para a tela. Tudo em pt-BR, e toda data em UTC — as datas do
 * sistema são datas de calendário guardadas na meia-noite UTC, então
 * renderizar no fuso local mostraria o dia anterior (ver lib/date-only.ts). */

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function toDateInputValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

/** "agosto de 2026", a partir de uma data ou de um "YYYY-MM". */
export function formatMonth(value: Date | string) {
  const date =
    value instanceof Date ? value : new Date(`${value.length === 7 ? `${value}-01` : value}T00:00:00.000Z`);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "seg", "ter" — o dia da semana abreviado, sem o ponto final. */
export function formatWeekday(value: Date) {
  return value.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
}

/** Percentual de uma parte sobre um total. Devolve o travessão quando não há
 * base de comparação — dividir por zero e mostrar "0,0%" ou "Infinity%"
 * seria pior que admitir que a conta não existe. */
export function formatPercent(part: number, whole: number, casas = 1) {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(casas)}%`;
}

/** Tamanho de arquivo legível. */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
