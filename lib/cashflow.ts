import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

function signedAmount(type: "INCOME" | "EXPENSE", amount: Prisma.Decimal | number) {
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

export async function getConsolidatedBalance(companyId: string): Promise<number> {
  const accounts = await prisma.account.findMany({
    where: { companyId },
    select: { initialBalance: true },
  });
  const transactions = await prisma.transaction.findMany({
    where: { companyId },
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
export async function getBalanceProjection(companyId: string, days: 30 | 60 | 90) {
  const currentBalance = await getConsolidatedBalance(companyId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);

  const pending = await prisma.scheduledEntry.findMany({
    where: {
      companyId,
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { lte: horizon },
    },
    orderBy: { dueDate: "asc" },
    select: { dueDate: true, amount: true, type: true },
  });

  const points: ProjectionPoint[] = [{ label: "Hoje", date: today, balance: currentBalance }];
  let running = currentBalance;

  for (const entry of pending) {
    running += signedAmount(entry.type === "RECEIVABLE" ? "INCOME" : "EXPENSE", entry.amount);
    points.push({
      label: entry.dueDate.toLocaleDateString("pt-BR"),
      date: entry.dueDate,
      balance: running,
    });
  }

  return { currentBalance, projectedBalance: running, points };
}

export async function getMonthlySummary(companyId: string, months = 6) {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - (months - 1));

  const transactions = await prisma.transaction.findMany({
    where: { companyId, date: { gte: start } },
    select: { date: true, amount: true, type: true },
  });

  const buckets = new Map<string, { income: number; expense: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { income: 0, expense: 0 });
  }

  for (const t of transactions) {
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key);
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
