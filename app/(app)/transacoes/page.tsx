import { prisma } from "@/lib/prisma";
import { getActiveScope, getAllCompanies, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { ImportDialog } from "./import-dialog";
import { TransactionsTable } from "./transactions-table";
import { OpenCompanyButton } from "@/components/open-company-button";
import type { Prisma } from "@/lib/generated/prisma/client";

interface Props {
  searchParams: Promise<{
    accountId?: string;
    categoryId?: string;
    supplierId?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}

async function ConsolidatedTransactionsSummary({
  companyIds,
  scopeLabel,
}: {
  companyIds: string[];
  scopeLabel: string;
}) {
  const companies =
    companyIds.length === 0
      ? []
      : await prisma.company.findMany({ where: { id: { in: companyIds } }, orderBy: { name: "asc" } });

  const summaries = await Promise.all(
    companies.map(async (company) => {
      const [count, incomeAgg, expenseAgg] = await Promise.all([
        prisma.transaction.count({ where: { companyId: company.id } }),
        prisma.transaction.aggregate({
          where: { companyId: company.id, type: "INCOME", transferCompanyId: null },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { companyId: company.id, type: "EXPENSE", transferCompanyId: null },
          _sum: { amount: true },
        }),
      ]);
      return {
        id: company.id,
        name: company.name,
        count,
        income: Number(incomeAgg._sum.amount ?? 0),
        expense: Number(expenseAgg._sum.amount ?? 0),
      };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Transações</h1>
        <p className="text-muted-foreground text-sm">
          Resumo por empresa — {scopeLabel}. Selecione uma empresa específica no menu à esquerda (ou clique
          em "Ver transações" abaixo) para lançar ou consultar o detalhe de cada transação.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{summaries.length} empresa(s)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Lançamentos</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma empresa nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {summaries.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(s.income)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(s.expense)}
                  </TableCell>
                  <TableCell className="text-right">
                    <OpenCompanyButton companyId={s.id} href="/transacoes" label="Ver transações" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function TransacoesPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedTransactionsSummary companyIds={companyIds} scopeLabel={scopeLabel} />;
  }
  const companyId = scope.companyId;

  const [accounts, categories, suppliers, allCompanies] = await Promise.all([
    prisma.account.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    getAllCompanies(),
  ]);

  const where: Prisma.TransactionWhereInput = { companyId };
  if (params.accountId) where.accountId = params.accountId;
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.supplierId) where.supplierId = params.supplierId;
  if (params.type === "INCOME" || params.type === "EXPENSE") where.type = params.type;
  if (params.from || params.to) {
    where.date = {
      ...(params.from ? { gte: new Date(params.from) } : {}),
      ...(params.to ? { lte: new Date(params.to) } : {}),
    };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { account: true, category: true, supplier: true },
    // Data mais recente primeiro; dentro do mesmo dia, entradas antes de saídas.
    orderBy: [{ date: "desc" }, { type: "asc" }],
    take: 500,
  });

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryOptions = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as "INCOME" | "EXPENSE",
  }));
  const supplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));
  const otherCompanyOptions = allCompanies.filter((c) => c.id !== companyId).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Transações</h1>
          <p className="text-muted-foreground text-sm">Entradas e saídas lançadas manualmente ou importadas.</p>
        </div>
        <div className="flex gap-2">
          <ImportDialog accounts={accountOptions} categories={categoryOptions} />
          <TransactionFormDialog
            accounts={accountOptions}
            categories={categoryOptions}
            suppliers={supplierOptions}
            otherCompanies={otherCompanyOptions}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" method="GET">
            <div className="space-y-1">
              <Label htmlFor="from">De</Label>
              <Input id="from" name="from" type="date" defaultValue={params.from} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">Até</Label>
              <Input id="to" name="to" type="date" defaultValue={params.to} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="accountId">Conta</Label>
              <select
                id="accountId"
                name="accountId"
                defaultValue={params.accountId ?? ""}
                className="h-8 w-44 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="">Todas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="categoryId">Categoria</Label>
              <select
                id="categoryId"
                name="categoryId"
                defaultValue={params.categoryId ?? ""}
                className="h-8 w-44 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplierId">Fornecedor</Label>
              <select
                id="supplierId"
                name="supplierId"
                defaultValue={params.supplierId ?? ""}
                className="h-8 w-44 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="">Todos</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="type">Tipo</Label>
              <select
                id="type"
                name="type"
                defaultValue={params.type ?? ""}
                className="h-8 w-36 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="">Todos</option>
                <option value="INCOME">Entrada</option>
                <option value="EXPENSE">Saída</option>
              </select>
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Filtrar
            </Button>
            <Button size="sm" variant="ghost" nativeButton={false} render={<a href="/transacoes" />}>
              Limpar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{transactions.length} transações</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionsTable
            accounts={accountOptions}
            categories={categoryOptions}
            suppliers={supplierOptions}
            otherCompanies={otherCompanyOptions}
            transactions={transactions.map((t) => ({
              id: t.id,
              date: t.date,
              description: t.description,
              accountId: t.accountId,
              accountName: t.account.name,
              categoryId: t.categoryId,
              categoryName: t.category?.name ?? null,
              supplierId: t.supplierId,
              supplierName: t.supplier?.name ?? null,
              transferCompanyId: t.transferCompanyId,
              source: t.source,
              type: t.type as "INCOME" | "EXPENSE",
              amount: Number(t.amount),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
