import { prisma } from "@/lib/prisma";
import { getDefaultCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { ImportDialog } from "./import-dialog";
import { TransactionsTable } from "./transactions-table";
import type { Prisma } from "@/lib/generated/prisma/client";

interface Props {
  searchParams: Promise<{
    accountId?: string;
    categoryId?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function TransacoesPage({ searchParams }: Props) {
  const params = await searchParams;
  const company = await getDefaultCompany();

  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({ where: { companyId: company.id }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { companyId: company.id }, orderBy: { name: "asc" } }),
  ]);

  const where: Prisma.TransactionWhereInput = { companyId: company.id };
  if (params.accountId) where.accountId = params.accountId;
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.type === "INCOME" || params.type === "EXPENSE") where.type = params.type;
  if (params.from || params.to) {
    where.date = {
      ...(params.from ? { gte: new Date(params.from) } : {}),
      ...(params.to ? { lte: new Date(params.to) } : {}),
    };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { account: true, category: true },
    orderBy: { date: "desc" },
    take: 500,
  });

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryOptions = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as "INCOME" | "EXPENSE",
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Transações</h1>
          <p className="text-muted-foreground text-sm">Entradas e saídas lançadas manualmente ou importadas.</p>
        </div>
        <div className="flex gap-2">
          <ImportDialog accounts={accountOptions} categories={categoryOptions} />
          <TransactionFormDialog accounts={accountOptions} categories={categoryOptions} />
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
            transactions={transactions.map((t) => ({
              id: t.id,
              date: t.date,
              description: t.description,
              accountId: t.accountId,
              accountName: t.account.name,
              categoryId: t.categoryId,
              categoryName: t.category?.name ?? null,
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
