import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { getConsolidatedBalance, getBalanceProjection, getMonthlySummary } from "@/lib/cashflow";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { OpenCompanyButton } from "@/components/open-company-button";
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

export default async function DashboardPage() {
  const scope = await getActiveScope();
  const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
  const isConsolidated = scope.type !== "company";

  const [balance, monthly, projection90, upcoming, dueSummary] = await Promise.all([
    getConsolidatedBalance(companyIds),
    getMonthlySummary(companyIds, 6),
    getBalanceProjection(companyIds, 90),
    isConsolidated || companyIds.length === 0
      ? []
      : prisma.scheduledEntry.findMany({
          where: {
            companyId: { in: companyIds },
            status: { in: ["PENDING", "OVERDUE"] },
            dueDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { dueDate: "asc" },
          take: 8,
        }),
    isConsolidated ? getDueSummaryByCompany(companyIds) : Promise.resolve([]),
  ]);

  const currentMonth = monthly[monthly.length - 1];
  const projectionPoints = projection90.points.map((p) => ({ label: p.label, balance: p.balance }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral do fluxo de caixa — {scopeLabel}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Saldo atual</CardDescription>
            <Wallet className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{formatCurrency(balance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Entradas no mês</CardDescription>
            <TrendingUp className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {formatCurrency(currentMonth?.income ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Saídas no mês</CardDescription>
            <TrendingDown className="size-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {formatCurrency(currentMonth?.expense ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Projeção 90 dias</CardDescription>
            <AlertTriangle className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {formatCurrency(projection90.projectedBalance)}
            </div>
          </CardContent>
        </Card>
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
            <CardDescription>Saldo atual + contas a pagar/receber pendentes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectionChart data={projectionPoints} />
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
