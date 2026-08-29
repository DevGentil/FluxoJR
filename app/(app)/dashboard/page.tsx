import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { getConsolidatedBalance, getBalanceProjection, getMonthlySummary } from "@/lib/cashflow";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { OpenCompanyButton } from "@/components/open-company-button";
import { KpiCard } from "@/components/kpi-card";
import { currentMonthKey, startOfMonth, startOfNextMonth } from "@/lib/date-only";
import { MonthlyChart } from "./monthly-chart";
import { ProjectionChart } from "./projection-chart";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle } from "lucide-react";

interface CompanyDueSummary {
  companyId: string;
  companyName: string;
  payable: number;
  receivable: number;
  overdueCount: number;
}

async function getDueSummaryByCompany(companyIds: string[]): Promise<CompanyDueSummary[]> {
  if (companyIds.length === 0) return [];

  const [entries, companies] = await Promise.all([
    prisma.scheduledEntry.findMany({
      where: { companyId: { in: companyIds }, status: { in: ["PENDING", "OVERDUE"] } },
      select: { companyId: true, type: true, amount: true, dueDate: true, status: true },
    }),
    prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }),
  ]);

  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  const now = new Date();
  const byCompany = new Map<string, { payable: number; receivable: number; overdueCount: number }>();

  for (const entry of entries) {
    const bucket = byCompany.get(entry.companyId) ?? { payable: 0, receivable: 0, overdueCount: 0 };
    const amount = Number(entry.amount);
    if (entry.type === "PAYABLE") bucket.payable += amount;
    else bucket.receivable += amount;
    const isOverdue = entry.status === "OVERDUE" || (entry.status === "PENDING" && entry.dueDate < now);
    if (isOverdue) bucket.overdueCount += 1;
    byCompany.set(entry.companyId, bucket);
  }

  return Array.from(byCompany.entries())
    .map(([companyId, bucket]) => ({
      companyId,
      companyName: companyNameById.get(companyId) ?? "",
      ...bucket,
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TopExpense {
  categoryName: string;
  total: number;
}

/** As maiores despesas do mês, por categoria. Saber que saíram R$ 68 mil não
 * diz o que fazer; saber que R$ 40 mil foram folha, sim. Transferência entre
 * empresas do grupo fica de fora — não é despesa, é dinheiro mudando de
 * bolso dentro da mesma holding. */
async function getTopExpenses(companyIds: string[], month: string): Promise<TopExpense[]> {
  if (companyIds.length === 0) return [];

  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      companyId: { in: companyIds },
      type: "EXPENSE",
      transferCompanyId: null,
      date: { gte: startOfMonth(month), lt: startOfNextMonth(month) },
    },
    _sum: { amount: true },
  });
  if (grouped.length === 0) return [];

  const categories = await prisma.category.findMany({
    where: { id: { in: grouped.map((g) => g.categoryId).filter((id): id is string => id != null) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  return grouped
    .map((g) => ({
      categoryName: g.categoryId ? (nameById.get(g.categoryId) ?? "Sem categoria") : "Sem categoria",
      total: Number(g._sum.amount ?? 0),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

/** Os vencimentos dos próximos 30 dias, para o bloco "a vencer" da visão de
 * uma empresa. Mora fora do componente porque lê o relógio: chamada de
 * dentro do corpo, a leitura tornaria o render impuro. */
function getUpcomingEntries(companyIds: string[]) {
  return prisma.scheduledEntry.findMany({
    where: {
      companyId: { in: companyIds },
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { lte: new Date(Date.now() + 30 * DAY_MS) },
    },
    orderBy: { dueDate: "asc" },
    take: 8,
  });
}

export default async function DashboardPage() {
  const scope = await getActiveScope();
  const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
  const isConsolidated = scope.type !== "company";

  const [balance, monthly, projection90, upcoming, dueSummary, topExpenses] = await Promise.all([
    getConsolidatedBalance(companyIds),
    getMonthlySummary(companyIds, 6),
    getBalanceProjection(companyIds, 90),
    isConsolidated || companyIds.length === 0 ? [] : getUpcomingEntries(companyIds),
    isConsolidated ? getDueSummaryByCompany(companyIds) : Promise.resolve([]),
    getTopExpenses(companyIds, currentMonthKey()),
  ]);

  const currentMonth = monthly[monthly.length - 1];
  const previousMonth = monthly[monthly.length - 2];
  const projectionPoints = projection90.points.map((p) => ({ label: p.label, balance: p.balance }));

  const income = currentMonth?.income ?? 0;
  const expense = currentMonth?.expense ?? 0;
  const net = income - expense;
  const previousNet = (previousMonth?.income ?? 0) - (previousMonth?.expense ?? 0);
  const totalExpenses = topExpenses.reduce((s, e) => s + e.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral do fluxo de caixa — {scopeLabel}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Saldo atual" value={formatCurrency(balance)} icon={Wallet} iconClass="text-muted-foreground" />
        <KpiCard
          label="Entradas no mês"
          value={formatCurrency(income)}
          delta={{ previous: previousMonth?.income ?? 0, current: income, label: "vs. mês anterior" }}
          icon={TrendingUp}
          iconClass="text-emerald-500"
        />
        <KpiCard
          label="Saídas no mês"
          value={formatCurrency(expense)}
          delta={{
            previous: previousMonth?.expense ?? 0,
            current: expense,
            label: "vs. mês anterior",
            goodWhenUp: false,
          }}
          icon={TrendingDown}
          iconClass="text-red-500"
        />
        <KpiCard
          label="Resultado do mês"
          value={formatCurrency(net)}
          delta={{ previous: previousNet, current: net, label: "vs. mês anterior" }}
          icon={net < 0 ? TrendingDown : TrendingUp}
          iconClass={net < 0 ? "text-destructive" : "text-emerald-500"}
        />
        <KpiCard
          label="Projeção 90 dias"
          value={formatCurrency(projection90.projectedBalance)}
          hint={
            projection90.overdue !== 0
              ? `Inclui ${formatCurrency(Math.abs(projection90.overdue))} já vencido`
              : undefined
          }
          icon={AlertTriangle}
          iconClass="text-amber-500"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Entradas x Saídas (6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyChart data={monthly} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Projeção de saldo (90 dias)</CardTitle>
            <CardDescription>
              Saldo atual + contas a pagar/receber pendentes. O que já venceu entra logo depois de
              &quot;Hoje&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectionChart data={projectionPoints} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Para onde foi o dinheiro este mês</CardTitle>
          <CardDescription>
            Maiores despesas por categoria. Transferência entre empresas do grupo fica de fora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma despesa lançada neste mês.</p>
          ) : (
            <div className="space-y-3">
              {topExpenses.map((e) => (
                <div key={e.categoryName} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="truncate">{e.categoryName}</span>
                    <span className="tabular-nums shrink-0">
                      {formatCurrency(e.total)}
                      <span className="text-muted-foreground ml-2">
                        {totalExpenses > 0 ? `${((e.total / totalExpenses) * 100).toFixed(0)}%` : ""}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-red-500/70"
                      style={{
                        width: `${totalExpenses > 0 ? (e.total / totalExpenses) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isConsolidated ? (
        <Card>
          <CardHeader>
            <CardTitle>Contas a pagar/receber pendentes por empresa</CardTitle>
          </CardHeader>
          <CardContent>
            {dueSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum lançamento pendente nesse escopo.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">A pagar</TableHead>
                    <TableHead className="text-right">A receber</TableHead>
                    <TableHead>Atrasados</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dueSummary.map((s) => (
                    <TableRow key={s.companyId}>
                      <TableCell className="font-medium">{s.companyName}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                        {formatCurrency(s.payable)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(s.receivable)}
                      </TableCell>
                      <TableCell>
                        {s.overdueCount > 0 ? (
                          <Badge variant="destructive">{s.overdueCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <OpenCompanyButton
                          companyId={s.companyId}
                          href="/contas-a-pagar-receber"
                          label="Ver lançamentos"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Próximos vencimentos (30 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum vencimento nos próximos 30 dias.</p>
            ) : (
              <ul className="divide-y">
                {upcoming.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{entry.description}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(entry.dueDate)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={entry.type === "PAYABLE" ? "destructive" : "default"}>
                        {entry.type === "PAYABLE" ? "A pagar" : "A receber"}
                      </Badge>
                      <span className="tabular-nums font-medium">{formatCurrency(Number(entry.amount))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
