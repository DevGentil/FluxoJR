import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  addDays,
  addMonths,
  currentMonthKey,
  endOfDay,
  parseDateOnly,
  startOfMonth,
  toDateOnly,
  toMonthKey,
  todayDateOnly,
} from "@/lib/date-only";
import { formatDate } from "@/lib/format";

export function signedAmount(type: "INCOME" | "EXPENSE", amount: Prisma.Decimal | number) {
  const value = Number(amount);
  return type === "INCOME" ? value : -value;
}

export async function getAccountBalance(accountId: string): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const transactions = await prisma.transaction.findMany({
    where: { accountId },
    select: { amount: true, type: true },
  });

  const delta = transactions.reduce((sum, t) => sum + signedAmount(t.type, t.amount), 0);
  return Number(account.initialBalance) + delta;
}

export async function getConsolidatedBalance(companyIds: string[]): Promise<number> {
  if (companyIds.length === 0) return 0;
  const accounts = await prisma.account.findMany({
    where: { companyId: { in: companyIds } },
    select: { initialBalance: true },
  });
  const transactions = await prisma.transaction.findMany({
    where: { companyId: { in: companyIds } },
    select: { amount: true, type: true },
  });

  const initial = accounts.reduce((sum, a) => sum + Number(a.initialBalance), 0);
  const delta = transactions.reduce((sum, t) => sum + signedAmount(t.type, t.amount), 0);
  return initial + delta;
}

export interface ProjectionPoint {
  label: string;
  date: Date;
  balance: number;
}

/**
 * Projeta o saldo consolidado somando o saldo atual às contas a pagar/receber
 * pendentes com vencimento até `days` dias à frente.
 */
export async function getBalanceProjection(companyIds: string[], days: 30 | 60 | 90) {
  const currentBalance = await getConsolidatedBalance(companyIds);

  const today = todayDateOnly();
  const horizon = addDays(today, days);

  const pending =
    companyIds.length === 0
      ? []
      : await prisma.scheduledEntry.findMany({
          where: {
            companyId: { in: companyIds },
            status: { in: ["PENDING", "OVERDUE"] },
            dueDate: { lte: endOfDay(horizon) },
          },
          select: { dueDate: true, amount: true, type: true },
        });

  // Um ponto por DIA, não por lançamento: cinco boletos vencendo na mesma
  // data são um degrau só na linha, e não cinco rótulos repetidos.
  const deltaByDay = new Map<string, number>();
  for (const entry of pending) {
    const day = toDateOnly(entry.dueDate);
    const delta = signedAmount(entry.type === "RECEIVABLE" ? "INCOME" : "EXPENSE", entry.amount);
    deltaByDay.set(day, (deltaByDay.get(day) ?? 0) + delta);
  }

  const points: ProjectionPoint[] = [
    { label: "Hoje", date: parseDateOnly(today), balance: currentBalance },
  ];
  let running = currentBalance;

  for (const day of [...deltaByDay.keys()].sort()) {
    running += deltaByDay.get(day)!;
    points.push({
      // Formatado em UTC como o resto do sistema: sem isso, a meia-noite
      // UTC do vencimento aparecia como o dia anterior no rótulo.
      label: formatDate(parseDateOnly(day)),
      date: parseDateOnly(day),
      balance: running,
    });
  }

  return { currentBalance, projectedBalance: running, points };
}

export async function getMonthlySummary(companyIds: string[], months = 6) {
  // Tudo em UTC: a data da transação é uma data de calendário, e ler o mês
  // dela pelo relógio local jogava todo lançamento do dia 1º no mês
  // anterior (em UTC-3, meia-noite UTC do dia 1º é 21h do dia 31).
  const firstMonth = addMonths(currentMonthKey(), -(months - 1));

  const transactions =
    companyIds.length === 0
      ? []
      : await prisma.transaction.findMany({
          where: {
            companyId: { in: companyIds },
            date: { gte: startOfMonth(firstMonth) },
            transferCompanyId: null,
          },
          select: { date: true, amount: true, type: true },
        });

  const buckets = new Map<string, { income: number; expense: number }>();
  for (let i = 0; i < months; i++) {
    buckets.set(addMonths(firstMonth, i), { income: 0, expense: 0 });
  }

  for (const t of transactions) {
    const bucket = buckets.get(toMonthKey(t.date));
    if (!bucket) continue;
    if (t.type === "INCOME") bucket.income += Number(t.amount);
    else bucket.expense += Number(t.amount);
  }

  return Array.from(buckets.entries()).map(([key, value]) => {
    const [year, month] = key.split("-").map(Number);
    const label = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
      month: "short",
      year: "2-digit",
    });
    return { key, label, ...value, net: value.income - value.expense };
  });
}
