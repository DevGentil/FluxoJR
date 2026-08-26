import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportCsvButton } from "./export-csv-button";

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

interface ReportRow {
  empresa: string;
  categoria: string;
  fornecedor: string;
  tipo: "INCOME" | "EXPENSE";
  centroCusto: string;
  total: number;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/** Agrupa as linhas por empresa (ordem alfabética) e ordena cada grupo por
 * valor decrescente — mesmo padrão usado em Contas a Pagar/Receber. */
function groupByCompany(rows: ReportRow[]) {
  const byCompany = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const list = byCompany.get(row.empresa) ?? [];
    list.push(row);
    byCompany.set(row.empresa, list);
  }
  return Array.from(byCompany.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([empresa, companyRows]) => ({
      empresa,
      rows: companyRows.slice().sort((a, b) => b.total - a.total),
    }));
}

function CategorySection({
  title,
  colorClass,
  rows,
  showCompanyColumn,
  totalLabel,
  total,
  emptyLabel,
}: {
  title: string;
  colorClass: string;
  rows: ReportRow[];
  showCompanyColumn: boolean;
  totalLabel: string;
  total: number;
  emptyLabel: string;
}) {
  const groups = showCompanyColumn ? groupByCompany(rows) : null;

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
            {groups
              ? groups.map((group) => (
                  <Fragment key={group.empresa}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={4} className="font-semibold">
                        {group.empresa}
                      </TableCell>
                    </TableRow>
                    {group.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.categoria}</TableCell>
                        <TableCell>{r.fornecedor}</TableCell>
                        <TableCell>{r.centroCusto}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(r.total)}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))
              : rows.map((r, i) => (
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

export default async function RelatoriosPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = { from: params.from || defaultRange().from, to: params.to || defaultRange().to };
  const scope = await getActiveScope();
  const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
  const showCompanyColumn = companyIds.length > 1;

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

  const csvRows = [...incomeRows, ...expenseRows].map((r) => ({
    ...(showCompanyColumn ? { empresa: r.empresa } : {}),
    categoria: r.categoria,
    fornecedor: r.fornecedor,
    tipo: r.tipo === "INCOME" ? "Entrada" : "Saída",
    centroCusto: r.centroCusto,
    total: r.total,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-muted-foreground text-sm">
            DRE simplificado por categoria e centro de custo — {scopeLabel}.
          </p>
        </div>
        <ExportCsvButton rows={csvRows} fileName={`dre-${range.from}-a-${range.to}.csv`} />
      </div>

      <Card>
        <CardContent className="pt-6">
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
          <CardContent className="text-xl font-semibold tabular-nums">{formatCurrency(result)}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategorySection
          title="Entradas por categoria"
          colorClass="text-emerald-600 dark:text-emerald-400"
          rows={incomeRows}
          showCompanyColumn={showCompanyColumn}
          totalLabel="Total de entradas"
          total={totalIncome}
          emptyLabel="Nenhuma entrada no período selecionado."
        />
        <CategorySection
          title="Saídas por categoria"
          colorClass="text-red-600 dark:text-red-400"
          rows={expenseRows}
          showCompanyColumn={showCompanyColumn}
          totalLabel="Total de saídas"
          total={totalExpense}
          emptyLabel="Nenhuma saída no período selecionado."
        />
      </div>
    </div>
  );
}
