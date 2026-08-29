import { Fragment } from "react";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { getPeriodBalanceReport, type PeriodBalanceReport } from "@/lib/balance-report";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { PeriodFilter } from "@/components/period-filter";
import { startOfDay, endOfDay, todayDateOnly, startOfWeek, firstDayOfMonth } from "@/lib/date-only";

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

/** Os atalhos de período trabalham em datas de calendário. Passar por
 * `toISOString()` sobre o relógio local devolvia o dia seguinte depois das
 * 21h no horário de Brasília, e "hoje" virava amanhã toda noite. */
function presetRange(kind: "today" | "week" | "month") {
  const to = todayDateOnly();
  if (kind === "today") return { from: to, to };
  if (kind === "week") return { from: startOfWeek(to), to };
  return { from: firstDayOfMonth(to), to };
}

function defaultRange() {
  return presetRange("week");
}

function netFlowColor(value: number) {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "";
}

/** Posição de contas agrupada por empresa (uma seção por unidade, com
 * subtotal e atalho pro balanço daquela empresa) em vez de uma lista única
 * misturando contas de empresas diferentes. */
function AccountsPositionByCompany({ report }: { report: PeriodBalanceReport }) {
  const groups: { companyId: string; companyName: string; accounts: PeriodBalanceReport["accounts"] }[] = [];
  for (const account of report.accounts) {
    let group = groups.find((g) => g.companyId === account.companyId);
    if (!group) {
      group = { companyId: account.companyId, companyName: account.companyName, accounts: [] };
      groups.push(group);
    }
    group.accounts.push(account);
  }
  groups.sort((a, b) => a.companyName.localeCompare(b.companyName));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Conta</TableHead>
          <TableHead className="text-right">Saldo inicial</TableHead>
          <TableHead className="text-right">Saldo final</TableHead>
          <TableHead className="text-right">Variação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
              Nenhuma conta cadastrada para esse escopo.
            </TableCell>
          </TableRow>
        )}
        {groups.map((group) => {
          const subtotalOpening = group.accounts.reduce((s, a) => s + a.opening, 0);
          const subtotalClosing = group.accounts.reduce((s, a) => s + a.closing, 0);
          return (
            <Fragment key={group.companyId}>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={3} className="font-semibold">
                  {group.companyName}
                </TableCell>
                <TableCell className="text-right">
                  <SwitchToCompanyButton companyId={group.companyId} label="Ver balanço" />
                </TableCell>
              </TableRow>
              {group.accounts.map((a) => (
                <TableRow key={a.accountId}>
                  <TableCell className="pl-6">{a.accountName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(a.opening)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(a.closing)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${netFlowColor(a.variation)}`}>
                    {formatCurrency(a.variation)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="text-muted-foreground text-sm">Subtotal {group.companyName}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground text-sm">
                  {formatCurrency(subtotalOpening)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground text-sm">
                  {formatCurrency(subtotalClosing)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums text-sm ${netFlowColor(subtotalClosing - subtotalOpening)}`}
                >
                  {formatCurrency(subtotalClosing - subtotalOpening)}
                </TableCell>
              </TableRow>
            </Fragment>
          );
        })}
      </TableBody>
      {groups.length > 0 && (
        <TableFooter>
          <TableRow>
            <TableCell>Total consolidado</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(report.totalOpening)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(report.totalClosing)}</TableCell>
            <TableCell
              className={`text-right tabular-nums ${netFlowColor(report.totalClosing - report.totalOpening)}`}
            >
              {formatCurrency(report.totalClosing - report.totalOpening)}
            </TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

export default async function BalancoPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = { from: params.from || defaultRange().from, to: params.to || defaultRange().to };
  const scope = await getActiveScope();
  const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
  const showCompanyColumn = companyIds.length > 1;

  const report = await getPeriodBalanceReport(
    companyIds,
    startOfDay(range.from),
    endOfDay(range.to)
  );

  const presets = [
    { label: "Hoje", ...presetRange("today") },
    { label: "Esta semana", ...presetRange("week") },
    { label: "Este mês", ...presetRange("month") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Balanço Executivo</h1>
        <p className="text-muted-foreground text-sm">
          Desempenho, posição de contas e origem de receitas/despesas — {scopeLabel}.
        </p>
      </div>

      <PeriodFilter basePath="/balanco" presets={presets} range={range} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Faturamento apurado</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(report.revenue)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Despesas & pagamentos</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatCurrency(report.expense)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Fluxo líquido do período</CardTitle>
          </CardHeader>
          <CardContent className={`text-xl font-semibold tabular-nums ${netFlowColor(report.netFlow)}`}>
            {formatCurrency(report.netFlow)}
          </CardContent>
        </Card>
      </div>

      {(report.transfersIn > 0 || report.transfersOut > 0) && (
        <p className="text-sm text-muted-foreground">
          Transferências entre empresas do grupo no período (não entram no faturamento/despesa acima):{" "}
          <span className="text-emerald-600 dark:text-emerald-400">recebido {formatCurrency(report.transfersIn)}</span>
          {" / "}
          <span className="text-red-600 dark:text-red-400">enviado {formatCurrency(report.transfersOut)}</span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Posição de contas</CardTitle>
        </CardHeader>
        <CardContent>
          {showCompanyColumn ? (
            <AccountsPositionByCompany report={report} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Saldo inicial</TableHead>
                  <TableHead className="text-right">Saldo final</TableHead>
                  <TableHead className="text-right">Variação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.accounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhuma conta cadastrada para esse escopo.
                    </TableCell>
                  </TableRow>
                )}
                {report.accounts.map((a) => (
                  <TableRow key={a.accountId}>
                    <TableCell className="font-medium">{a.accountName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(a.opening)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(a.closing)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${netFlowColor(a.variation)}`}>
                      {formatCurrency(a.variation)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {report.accounts.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell>Total consolidado</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(report.totalOpening)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(report.totalClosing)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${netFlowColor(report.totalClosing - report.totalOpening)}`}>
                      {formatCurrency(report.totalClosing - report.totalOpening)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Origem das receitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.revenueByCategory.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Sem receitas no período.</p>
            )}
            {report.revenueByCategory.map((c) => (
              <div key={c.categoryName} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.categoryName}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(c.total)} · {c.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(c.percent, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Origem dos pagamentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.expenseByCategory.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Sem despesas no período.</p>
            )}
            {report.expenseByCategory.map((c) => (
              <div key={c.categoryName} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.categoryName}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(c.total)} · {c.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${Math.min(c.percent, 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
