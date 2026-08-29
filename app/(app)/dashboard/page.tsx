import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { getAgingBuckets, getConsolidatedBalance, getMonthlySummary } from "@/lib/cashflow";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { OpenCompanyButton } from "@/components/open-company-button";
import { KpiCard } from "@/components/kpi-card";

import { MonthlyChart } from "./monthly-chart";
import { AgingChart } from "./aging-chart";
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

  const [balance, monthly, upcoming, dueSummary, aging] = await Promise.all([
    getConsolidatedBalance(companyIds),
    getMonthlySummary(companyIds, 6),
    isConsolidated || companyIds.length === 0 ? [] : getUpcomingEntries(companyIds),
    isConsolidated ? getDueSummaryByCompany(companyIds) : Promise.resolve([]),
    getAgingBuckets(companyIds),
  ]);

  const currentMonth = monthly[monthly.length - 1];
  const previousMonth = monthly[monthly.length - 2];

  const income = currentMonth?.income ?? 0;
  const expense = currentMonth?.expense ?? 0;
  const net = income - expense;
  const previousNet = (previousMonth?.income ?? 0) - (previousMonth?.expense ?? 0);

  // "Projeção 90 dias" saiu junto com o gráfico: somava o saldo às contas
  // pendentes e supunha que tudo seria pago no dia. No lugar, o que está
  // comprometido de fato no prazo em que a decisão é tomada.
  const ate30 = aging.filter((b) => b.label !== "31–60 dias" && b.label !== "60+ dias");
  const aPagar30 = ate30.reduce((s, b) => s + b.pagar, 0);
  const aReceber30 = ate30.reduce((s, b) => s + b.receber, 0);
  const vencido = aging.find((b) => b.label === "Vencido")?.pagar ?? 0;

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
          label="A pagar em 30 dias"
          value={formatCurrency(aPagar30)}
          hint={
            vencido > 0
              ? `${formatCurrency(vencido)} já vencido`
              : aReceber30 > 0
                ? `${formatCurrency(aReceber30)} a receber no mesmo prazo`
                : "Nada vencido"
          }
          icon={AlertTriangle}
          iconClass={vencido > 0 ? "text-destructive" : "text-amber-500"}
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
            <CardTitle>Vencimentos por faixa de prazo</CardTitle>
            <CardDescription>
              O que já está comprometido e quando vence — obrigações registradas, não estimativa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgingChart data={aging} />
          </CardContent>
        </Card>
      </div>

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
