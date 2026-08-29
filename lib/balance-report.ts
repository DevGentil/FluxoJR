import { prisma } from "@/lib/prisma";
import { signedAmount } from "@/lib/cashflow";

export interface AccountBalanceRow {
  accountId: string;
  accountName: string;
  companyId: string;
  companyName: string;
  opening: number;
  closing: number;
  variation: number;
}

export interface CompanyBalanceRow {
  companyId: string;
  companyName: string;
  opening: number;
  closing: number;
  variation: number;
}

export interface CategoryBreakdownRow {
  categoryName: string;
  total: number;
  percent: number;
}

export interface PeriodBalanceReport {
  revenue: number;
  expense: number;
  netFlow: number;
  accounts: AccountBalanceRow[];
  companyTotals: CompanyBalanceRow[];
  totalOpening: number;
  totalClosing: number;
  revenueByCategory: CategoryBreakdownRow[];
  expenseByCategory: CategoryBreakdownRow[];
  transfersIn: number;
  transfersOut: number;
}

const emptyReport: PeriodBalanceReport = {
  revenue: 0,
  expense: 0,
  netFlow: 0,
  accounts: [],
  companyTotals: [],
  totalOpening: 0,
  totalClosing: 0,
  revenueByCategory: [],
  expenseByCategory: [],
  transfersIn: 0,
  transfersOut: 0,
};

function toRanked(totals: Map<string, number>, total: number): CategoryBreakdownRow[] {
  return Array.from(totals.entries())
    .map(([categoryName, value]) => ({
      categoryName,
      total: value,
      percent: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Monta o Balanço Executivo de um período: saldo inicial/final por conta e
 * por empresa, faturamento/despesas do período (excluindo transferências
 * entre empresas do grupo, que não entram no "faturamento real"), e o
 * ranking de categorias por % do total — mesmo formato do balanço manual
 * que a holding já produz.
 */
export async function getPeriodBalanceReport(
  companyIds: string[],
  from: Date,
  to: Date
): Promise<PeriodBalanceReport> {
  if (companyIds.length === 0) return emptyReport;

  const [accounts, companies, priorTotals, transactions] = await Promise.all([
    prisma.account.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true, name: true, initialBalance: true, companyId: true },
    }),
    prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    }),
    // Do que veio ANTES do período só interessa o acumulado por conta, que
    // é o saldo inicial. Agrupado no banco: antes, abrir o Balanço trazia
    // para a memória toda a história de transações da holding, a cada vez.
    prisma.transaction.groupBy({
      by: ["accountId", "type"],
      where: { companyId: { in: companyIds }, date: { lt: from } },
      _sum: { amount: true },
    }),
    // Dentro do período, aí sim linha a linha — é o que alimenta o ranking
    // por categoria e a separação de transferências.
    prisma.transaction.findMany({
      where: { companyId: { in: companyIds }, date: { gte: from, lte: to } },
      select: {
        accountId: true,
        amount: true,
        type: true,
        transferCompanyId: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  const openingByAccount = new Map(accounts.map((a) => [a.id, Number(a.initialBalance)]));
  for (const g of priorTotals) {
    const signed = signedAmount(g.type as "INCOME" | "EXPENSE", g._sum.amount ?? 0);
    openingByAccount.set(g.accountId, (openingByAccount.get(g.accountId) ?? 0) + signed);
  }
  const closingByAccount = new Map(openingByAccount);

  let revenue = 0;
  let expense = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  const revenueByCategory = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();

  for (const t of transactions) {
    const type = t.type as "INCOME" | "EXPENSE";
    const signed = signedAmount(type, t.amount);
    const amount = Number(t.amount);

    closingByAccount.set(t.accountId, (closingByAccount.get(t.accountId) ?? 0) + signed);

    if (t.transferCompanyId) {
      if (type === "INCOME") transfersIn += amount;
      else transfersOut += amount;
      continue;
    }

    const categoryName = t.category?.name ?? "Sem categoria";
    if (type === "INCOME") {
      revenue += amount;
      revenueByCategory.set(categoryName, (revenueByCategory.get(categoryName) ?? 0) + amount);
    } else {
      expense += amount;
      expenseByCategory.set(categoryName, (expenseByCategory.get(categoryName) ?? 0) + amount);
    }
  }

  const accountRows: AccountBalanceRow[] = accounts.map((a) => {
    const opening = openingByAccount.get(a.id) ?? Number(a.initialBalance);
    const closing = closingByAccount.get(a.id) ?? Number(a.initialBalance);
    return {
      accountId: a.id,
      accountName: a.name,
      companyId: a.companyId,
      companyName: companyNameById.get(a.companyId) ?? "",
      opening,
      closing,
      variation: closing - opening,
    };
  });

  const companyTotals: CompanyBalanceRow[] = companies.map((c) => {
    const rows = accountRows.filter((r) => r.companyId === c.id);
    const opening = rows.reduce((s, r) => s + r.opening, 0);
    const closing = rows.reduce((s, r) => s + r.closing, 0);
    return { companyId: c.id, companyName: c.name, opening, closing, variation: closing - opening };
  });

  return {
    revenue,
    expense,
    netFlow: revenue - expense,
    accounts: accountRows,
    companyTotals,
    totalOpening: companyTotals.reduce((s, c) => s + c.opening, 0),
    totalClosing: companyTotals.reduce((s, c) => s + c.closing, 0),
    revenueByCategory: toRanked(revenueByCategory, revenue),
    expenseByCategory: toRanked(expenseByCategory, expense),
    transfersIn,
    transfersOut,
  };
}
