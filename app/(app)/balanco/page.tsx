import Link from "next/link";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { getPeriodBalanceReport } from "@/lib/balance-report";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  const day = from.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  from.setDate(from.getDate() - diffToMonday);
  return { from: toISODate(from), to: toISODate(to) };
}

function presetRange(kind: "today" | "week" | "month") {
  const to = new Date();
  const from = new Date(to);
  if (kind === "today") {
    // from === to
  } else if (kind === "week") {
    const day = from.getDay();
    from.setDate(from.getDate() - (day === 0 ? 6 : day - 1));
  } else {
    from.setDate(1);
  }
  return { from: toISODate(from), to: toISODate(to) };
}

function netFlowColor(value: number) {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "";
}

export default async function BalancoPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = { from: params.from || defaultRange().from, to: params.to || defaultRange().to };
  const scope = await getActiveScope();
  const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
  const showCompanyColumn = companyIds.length > 1;

  const report = await getPeriodBalanceReport(
    companyIds,
    new Date(`${range.from}T00:00:00`),
    new Date(`${range.to}T23:59:59.999`)
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

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/balanco?from=${p.from}&to=${p.to}`} />}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <form className="flex flex-wrap items-end gap-3" method="GET">
            <div className="space-y-1">
              <Label htmlFor="from">De</Label>
              <Input id="from" name="from" type="date" defaultValue={range.from} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">Até</Label>
              <Input id="to" name="to" type="date" defaultValue={range.to} className="w-40" />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Aplicar
            </Button>
          </form>
        </CardContent>
      </Card>

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
          <Table>
            <TableHeader>
              <TableRow>
                {showCompanyColumn && <TableHead>Empresa</TableHead>}
                <TableHead>Conta</TableHead>
                <TableHead className="text-right">Saldo inicial</TableHead>
                <TableHead className="text-right">Saldo final</TableHead>
                <TableHead className="text-right">Variação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={showCompanyColumn ? 5 : 4} className="text-center text-muted-foreground py-8">
                    Nenhuma conta cadastrada para esse escopo.
                  </TableCell>
                </TableRow>
              )}
              {report.accounts.map((a) => (
                <TableRow key={a.accountId}>
                  {showCompanyColumn && <TableCell>{a.companyName}</TableCell>}
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
                  <TableCell colSpan={showCompanyColumn ? 2 : 1}>Total consolidado</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(report.totalOpening)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(report.totalClosing)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${netFlowColor(report.totalClosing - report.totalOpening)}`}>
                    {formatCurrency(report.totalClosing - report.totalOpening)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
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
