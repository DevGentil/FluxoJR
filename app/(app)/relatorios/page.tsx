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

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
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

  const grouped = new Map<
    string,
    {
      empresa: string;
      categoria: string;
      fornecedor: string;
      tipo: "INCOME" | "EXPENSE";
      centroCusto: string;
      total: number;
    }
  >();
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
  const rows = [...incomeRows, ...expenseRows];
  const totalIncome = incomeRows.reduce((s, r) => s + r.total, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.total, 0);
  const result = totalIncome - totalExpense;

  const csvRows = rows.map((r) => ({
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
        <Card>
          <CardHeader>
            <CardTitle className="text-emerald-600 dark:text-emerald-400">Entradas por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {showCompanyColumn && <TableHead>Empresa</TableHead>}
                  <TableHead>Categoria</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Centro de custo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomeRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={showCompanyColumn ? 5 : 4} className="text-center text-muted-foreground py-8">
                      Nenhuma entrada no período selecionado.
                    </TableCell>
                  </TableRow>
                )}
                {incomeRows.map((r, i) => (
                  <TableRow key={i}>
                    {showCompanyColumn && <TableCell>{r.empresa}</TableCell>}
                    <TableCell className="font-medium">{r.categoria}</TableCell>
                    <TableCell>{r.fornecedor}</TableCell>
                    <TableCell>{r.centroCusto}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {incomeRows.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={showCompanyColumn ? 4 : 3}>Total de entradas</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totalIncome)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Saídas por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {showCompanyColumn && <TableHead>Empresa</TableHead>}
                  <TableHead>Categoria</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Centro de custo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={showCompanyColumn ? 5 : 4} className="text-center text-muted-foreground py-8">
                      Nenhuma saída no período selecionado.
                    </TableCell>
                  </TableRow>
                )}
                {expenseRows.map((r, i) => (
                  <TableRow key={i}>
                    {showCompanyColumn && <TableCell>{r.empresa}</TableCell>}
                    <TableCell className="font-medium">{r.categoria}</TableCell>
                    <TableCell>{r.fornecedor}</TableCell>
                    <TableCell>{r.centroCusto}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {expenseRows.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={showCompanyColumn ? 4 : 3}>Total de saídas</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totalExpense)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
