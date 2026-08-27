import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { DateRangePresets } from "@/components/date-range-presets";
import { ExportCsvButton } from "./export-csv-button";

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

interface ReportRow {
  companyId: string;
  empresa: string;
  categoria: string;
  fornecedor: string;
  tipo: "INCOME" | "EXPENSE";
  centroCusto: string;
  total: number;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from: toISODate(from), to: toISODate(to) };
}

function presetRange(kind: "today" | "week" | "month") {
  const to = new Date();
  const from = new Date(to);
  if (kind === "week") {
    const day = from.getDay();
    from.setDate(from.getDate() - (day === 0 ? 6 : day - 1));
  } else if (kind === "month") {
    from.setDate(1);
  }
  return { from: toISODate(from), to: toISODate(to) };
}

function resultColor(value: number) {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "";
}

function CategorySection({
  title,
  colorClass,
  rows,
  totalLabel,
  total,
  emptyLabel,
}: {
  title: string;
  colorClass: string;
  rows: ReportRow[];
  totalLabel: string;
  total: number;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={colorClass}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Centro de custo</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.categoria}</TableCell>
                <TableCell>{r.fornecedor}</TableCell>
                <TableCell>{r.centroCusto}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>{totalLabel}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(total)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}

/** DRE comparativo: uma linha por empresa (entradas, saídas, resultado,
 * margem) em vez de um DRE único somando tudo — reflete como a holding
 * realmente analisa os números (por unidade), com atalho pro DRE completo
 * daquela empresa. */
function CompanyComparisonTable({ rows }: { rows: ReportRow[] }) {
  interface CompanySummary {
    companyId: string;
    companyName: string;
    income: number;
    expense: number;
  }
  const summaries: CompanySummary[] = [];
  for (const r of rows) {
    let summary = summaries.find((s) => s.companyId === r.companyId);
    if (!summary) {
      summary = { companyId: r.companyId, companyName: r.empresa, income: 0, expense: 0 };
      summaries.push(summary);
    }
    if (r.tipo === "INCOME") summary.income += r.total;
    else summary.expense += r.total;
  }
  summaries.sort((a, b) => a.companyName.localeCompare(b.companyName));

  const totalIncome = summaries.reduce((s, c) => s + c.income, 0);
  const totalExpense = summaries.reduce((s, c) => s + c.expense, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>DRE por empresa</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead className="text-right">Entradas</TableHead>
              <TableHead className="text-right">Saídas</TableHead>
              <TableHead className="text-right">Resultado</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma movimentação no período selecionado.
                </TableCell>
              </TableRow>
            )}
            {summaries.map((s) => {
              const result = s.income - s.expense;
              const margin = s.income > 0 ? (result / s.income) * 100 : null;
              return (
                <TableRow key={s.companyId}>
                  <TableCell className="font-medium">{s.companyName}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(s.income)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(s.expense)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${resultColor(result)}`}>
                    {formatCurrency(result)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {margin === null ? "—" : `${margin.toFixed(1)}%`}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <SwitchToCompanyButton companyId={s.companyId} label="Ver DRE" />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {summaries.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell>Total consolidado</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totalIncome)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totalExpense)}</TableCell>
                <TableCell className={`text-right tabular-nums ${resultColor(totalIncome - totalExpense)}`}>
                  {formatCurrency(totalIncome - totalExpense)}
                </TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function RelatoriosPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = { from: params.from || defaultRange().from, to: params.to || defaultRange().to };
  const scope = await getActiveScope();
  const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
  const isConsolidated = scope.type !== "company";
  const presets = [
    { label: "Hoje", ...presetRange("today") },
    { label: "Esta semana", ...presetRange("week") },
    { label: "Este mês", ...presetRange("month") },
  ];

  const transactions =
    companyIds.length === 0
      ? []
      : await prisma.transaction.findMany({
          where: {
            companyId: { in: companyIds },
            date: { gte: new Date(range.from), lte: new Date(`${range.to}T23:59:59`) },
            transferCompanyId: null,
          },
          include: { category: true, company: true, supplier: true },
        });

  const grouped = new Map<string, ReportRow>();
  for (const t of transactions) {
    const empresa = t.company.name;
    const categoria = t.category?.name ?? "Sem categoria";
    const fornecedor = t.supplier?.name ?? "—";
    const centroCusto = t.category?.costCenter ?? "—";
    const key = `${empresa}__${categoria}__${fornecedor}__${centroCusto}__${t.type}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.total += Number(t.amount);
    } else {
      grouped.set(key, {
        companyId: t.companyId,
        empresa,
        categoria,
        fornecedor,
        tipo: t.type as "INCOME" | "EXPENSE",
        centroCusto,
        total: Number(t.amount),
      });
    }
  }

  const allRows = Array.from(grouped.values());
  const incomeRows = allRows.filter((r) => r.tipo === "INCOME").sort((a, b) => b.total - a.total);
  const expenseRows = allRows.filter((r) => r.tipo === "EXPENSE").sort((a, b) => b.total - a.total);
  const totalIncome = incomeRows.reduce((s, r) => s + r.total, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.total, 0);
  const result = totalIncome - totalExpense;

  // Exportação CSV só faz sentido no DRE de uma empresa específica — o
  // comparativo consolidado é pra visualizar na tela, não pra planilha.
  const csvHeaders = ["Categoria", "Fornecedor", "Tipo", "Centro de Custo", "Total"];
  const csvRows: (string | number)[][] = [...incomeRows, ...expenseRows].map((r) => [
    r.categoria,
    r.fornecedor,
    r.tipo === "INCOME" ? "Entrada" : "Saída",
    r.centroCusto,
    r.total,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-muted-foreground text-sm">
            {isConsolidated
              ? `DRE comparativo por empresa — ${scopeLabel}.`
              : `DRE simplificado por categoria e centro de custo — ${scopeLabel}.`}
          </p>
        </div>
        {!isConsolidated && (
          <ExportCsvButton
            headers={csvHeaders}
            rows={csvRows}
            fileName={`dre-${range.from}-a-${range.to}.csv`}
          />
        )}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <DateRangePresets basePath="/relatorios" presets={presets} />
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

      {isConsolidated ? (
        <CompanyComparisonTable rows={allRows} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Total de entradas</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalIncome)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Total de saídas</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">
                {formatCurrency(totalExpense)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Resultado do período</CardTitle>
              </CardHeader>
              <CardContent className={`text-xl font-semibold tabular-nums ${resultColor(result)}`}>
                {formatCurrency(result)}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CategorySection
              title="Entradas por categoria"
              colorClass="text-emerald-600 dark:text-emerald-400"
              rows={incomeRows}
              totalLabel="Total de entradas"
              total={totalIncome}
              emptyLabel="Nenhuma entrada no período selecionado."
            />
            <CategorySection
              title="Saídas por categoria"
              colorClass="text-red-600 dark:text-red-400"
              rows={expenseRows}
              totalLabel="Total de saídas"
              total={totalExpense}
              emptyLabel="Nenhuma saída no período selecionado."
            />
          </div>
        </>
      )}
    </div>
  );
}
