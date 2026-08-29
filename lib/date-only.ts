/** Datas de calendário — competência, vencimento, dia do atendimento, data
 * da transação — não têm hora: só o dia importa. Todas são guardadas na
 * meia-noite **UTC** e comparadas em UTC.
 *
 * Misturar essas datas com o fuso local é a origem de uma família inteira de
 * erros silenciosos. No horário de Brasília (UTC-3):
 *
 * - a meia-noite UTC do dia 1º é 21h do dia 31 no relógio local, então ler
 *   `getMonth()` de um lançamento do dia 1º devolve o mês anterior;
 * - filtrar `gte: new Date("2026-08-01T00:00:00")` (meia-noite local, 03h
 *   UTC) exclui tudo que foi lançado no próprio dia 1º;
 * - `new Date().toISOString().slice(0, 10)` devolve o dia seguinte depois
 *   das 21h.
 *
 * Por isso: para gravar e comparar, sempre UTC (as funções daqui); para
 * exibir, sempre `timeZone: "UTC"` (ver lib/format.ts). O relógio local só
 * entra quando a pergunta é "que dia é hoje para quem está olhando a tela" —
 * `todayDateOnly` e `currentMonthKey`. */

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" → meia-noite UTC daquele dia. Use para gravar. */
export function parseDateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Primeiro instante do dia, para o lado `gte` de um filtro. */
export const startOfDay = parseDateOnly;

/** Último instante do dia, para o lado `lte` de um filtro. */
export function endOfDay(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

/** Meia-noite UTC do primeiro dia do mês "YYYY-MM". */
export function startOfMonth(isoMonth: string): Date {
  return parseDateOnly(`${isoMonth}-01`);
}

/** Meia-noite UTC do primeiro dia do mês SEGUINTE a "YYYY-MM" — o lado
 * aberto (`lt`) de um intervalo mensal, que não corta o último dia. */
export function startOfNextMonth(isoMonth: string): Date {
  const [year, month] = isoMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1));
}

/** O dia de calendário de uma data já gravada, em "YYYY-MM-DD". */
export function toDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** O mês de calendário de uma data já gravada, em "YYYY-MM". */
export function toMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** O dia de HOJE no calendário de quem está olhando a tela. Lê o relógio
 * local de propósito — é a única pergunta aqui que depende dele. */
export function todayDateOnly(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** O mês de hoje, "YYYY-MM", também pelo relógio local. */
export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** Soma (ou subtrai) dias a uma data de calendário, sem passar pelo fuso. */
export function addDays(iso: string, days: number): string {
  const d = parseDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

/** Soma (ou subtrai) meses a "YYYY-MM". */
export function addMonths(isoMonth: string, months: number): string {
  const [year, month] = isoMonth.split("-").map(Number);
  return toMonthKey(new Date(Date.UTC(year, month - 1 + months, 1)));
}

/** A segunda-feira da semana de uma data de calendário. */
export function startOfWeek(iso: string): string {
  const d = parseDateOnly(iso);
  const day = d.getUTCDay(); // 0 = domingo
  return addDays(iso, -(day === 0 ? 6 : day - 1));
}

/** O primeiro dia do mês de uma data de calendário. */
export function firstDayOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
