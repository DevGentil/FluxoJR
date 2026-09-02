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
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, Bug, ArrowRight } from "lucide-react";
import Link from "next/link";
import { contaAtual } from "@/lib/access";
import { SEM_VENCIMENTOS, vencimentosProximos } from "@/lib/vencimentos";
import type { ScheduledEntry } from "@/lib/generated/prisma/client";

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

/** Um dos dois blocos do "a vencer".
 *
 * O cabeçalho não é enfeite: as duas listas são ordenadas por vencimento cada
 * uma, então no meio da lista as datas voltam para trás. Sem uma linha
 * dizendo que ali começa outra natureza, isso parece defeito. */
function GrupoVencimentos({
  titulo,
  entradas,
  total,
  aba,
}: {
  titulo: string;
  entradas: ScheduledEntry[];
  total: number;
  aba: "payable" | "receivable";
}) {
  if (total === 0) return null;
  const escondidos = total - entradas.length;
  const cor = aba === "payable" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div>
      <p className="text-muted-foreground px-1 pb-1 text-[11px] font-medium tracking-wide uppercase">
        {titulo} <span className="tabular-nums">({total})</span>
      </p>
      <ul className="divide-y">
        {entradas.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{entry.description}</p>
              <p className="text-muted-foreground text-sm">{formatDate(entry.dueDate)}</p>
            </div>
            {/* A cor carrega a natureza; o selo em cada linha seria repetir o
                que o cabeçalho do grupo já disse cinco vezes. */}
            <span className={`shrink-0 font-medium tabular-nums ${cor}`}>
              {formatCurrency(Number(entry.amount))}
            </span>
          </li>
        ))}
      </ul>
      {escondidos > 0 && (
        <Link
          href={`/contas-a-pagar-receber?aba=${aba}`}
          className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          e mais {escondidos} {escondidos === 1 ? "lançamento" : "lançamentos"}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const scope = await getActiveScope();
  const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
  const isConsolidated = scope.type !== "company";

  const [balance, monthly, upcoming, dueSummary, aging] = await Promise.all([
    getConsolidatedBalance(companyIds),
    getMonthlySummary(companyIds, 6),
    isConsolidated ? SEM_VENCIMENTOS : vencimentosProximos(companyIds),
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

  // O aviso de erro aparece onde a pessoa JA olha todo dia. Uma tela de
  // erros que so responde quando alguem vai ate la nao resolve "so descubro
  // se me contarem" — o aviso e que resolve.
  const conta = await contaAtual();
  const errosNaoVistos = conta?.holding
    ? await prisma.errorLog.count({ where: { seen: false } })
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral do fluxo de caixa — {scopeLabel}.</p>
      </div>

      {/* O aviso sempre levou para a tela de erros, mas nada dizia isso: sem
          seta e sem verbo, ele parecia um recado e não um caminho. Quem lia
          entendia "existem erros" e não "clique para ver quais". */}
      {errosNaoVistos > 0 && (
        <Link
          href="/erros"
          aria-label={`Ver os ${errosNaoVistos} erros novos do sistema`}
          className="group flex items-center gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-2.5 text-sm transition-colors hover:bg-amber-500/10 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
        >
          <Bug className="size-4 shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">
              {errosNaoVistos} {errosNaoVistos === 1 ? "erro novo" : "erros novos"} no sistema
            </span>
            <span className="text-muted-foreground"> — alguém pode ter esbarrado numa tela quebrada.</span>
          </span>
          {/* O verbo sai em tela estreita; a seta fica, porque é ela que diz
              que isto leva a algum lugar. */}
          <span className="ml-2 hidden shrink-0 items-center gap-1 font-medium text-amber-600 sm:flex dark:text-amber-500">
            Ver erros
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
          <ArrowRight className="size-4 shrink-0 text-amber-600 sm:hidden dark:text-amber-500" />
        </Link>
      )}

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
            {upcoming.totalPagar + upcoming.totalReceber === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum vencimento nos próximos 30 dias.</p>
            ) : (
              // O que sai primeiro é o que compromete caixa: a pagar antes de
              // a receber, cada bloco em ordem de vencimento.
              <div className="space-y-5">
                <GrupoVencimentos
                  titulo="A pagar"
                  entradas={upcoming.aPagar}
                  total={upcoming.totalPagar}
                  aba="payable"
                />
                <GrupoVencimentos
                  titulo="A receber"
                  entradas={upcoming.aReceber}
                  total={upcoming.totalReceber}
                  aba="receivable"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
