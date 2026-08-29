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

/** Saldo é uma soma sobre todo o histórico da conta: agrupar por tipo no
 * banco devolve duas linhas em vez de trazer cada transação já lançada para
 * a memória do servidor só para somá-las de novo a cada request. */
function sumSignedByType(groups: { type: string; _sum: { amount: Prisma.Decimal | null } }[]) {
  return groups.reduce(
    (sum, g) => sum + signedAmount(g.type as "INCOME" | "EXPENSE", g._sum.amount ?? 0),
    0
  );
}

export async function getAccountBalance(accountId: string): Promise<number> {
  const [account, byType] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { initialBalance: true } }),
    prisma.transaction.groupBy({ by: ["type"], where: { accountId }, _sum: { amount: true } }),
  ]);

  return Number(account.initialBalance) + sumSignedByType(byType);
}

export async function getConsolidatedBalance(companyIds: string[]): Promise<number> {
  if (companyIds.length === 0) return 0;

  const [accounts, byType] = await Promise.all([
    prisma.account.aggregate({
      where: { companyId: { in: companyIds } },
      _sum: { initialBalance: true },
    }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: { companyId: { in: companyIds } },
      _sum: { amount: true },
    }),
  ]);

  return Number(accounts._sum.initialBalance ?? 0) + sumSignedByType(byType);
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
