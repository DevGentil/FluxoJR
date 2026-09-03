import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "@/lib/date-only";
import { getActiveScope, getAllCompanies, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency, formatDate } from "@/lib/format";
import { Pagination } from "@/components/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { ImportDialog } from "./import-dialog";
import { TransactionsTable } from "./transactions-table";
import { OpenCompanyButton } from "@/components/open-company-button";
import { ExportCsvButton } from "@/components/export-csv-button";
import type { Prisma } from "@/lib/generated/prisma/client";

interface Props {
  searchParams: Promise<{
    /** Busca por descrição. Existe para a busca global ter para onde
     * levar: não há tela de uma transação só, então o resultado abre a
     * lista já filtrada pelo que a pessoa procurou. */
    q?: string;
    accountId?: string;
    categoryId?: string;
    supplierId?: string;
    type?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

/** Quantas transações por página. Antes a tela trazia 500 de uma vez e
 * dizia "500 transações" no título mesmo quando havia milhares — o número
 * era o do corte, não o do filtro. */
const PAGE_SIZE = 50;

/** Teto do CSV: exportar é para levar embora, mas puxar a base inteira em
 * memória para montar o arquivo não escala. */
const EXPORT_LIMIT = 10_000;

/** Achata o repasse vinculado a uma transação no formato que o diálogo de
 * detalhe espera. Os dias vêm junto da própria consulta das transações — não
 * há consulta extra por linha. */
function montarRepasse(payout: {
  month: Date;
  doctorId: string;
  approvedByName: string | null;
  doctor: { name: string };
  entries: {
    amount: Prisma.Decimal | null;
    lines: { quantity: Prisma.Decimal; rate: Prisma.Decimal; serviceItem: { name: string; category: string } }[];
  }[];
}) {
  const mes = payout.month.toISOString().slice(0, 7);
  const [ano, m] = mes.split("-");
  const linhas = payout.entries.flatMap((e) =>
    e.lines.map((l) => ({
      serviceItemName: l.serviceItem.name,
      categoria: l.serviceItem.category,
      quantity: Number(l.quantity),
      rate: Number(l.rate),
    }))
  );
  const semDetalhe = payout.entries.filter((e) => e.lines.length === 0);

  return {
    doctorId: payout.doctorId,
    doctorName: payout.doctor.name,
    mes,
    mesLabel: m + "/" + ano,
    dias: payout.entries.length,
    linhas,
    diasSemDetalhe: semDetalhe.length,
    valorSemDetalhe: semDetalhe.reduce((s, e) => s + Number(e.amount ?? 0), 0),
    aprovadoPor: payout.approvedByName,
  };
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
          em &quot;Ver transações&quot; abaixo) para lançar ou consultar o detalhe de cada transação.
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
  if (params.q) where.description = { contains: params.q, mode: "insensitive" };
  if (params.type === "INCOME" || params.type === "EXPENSE") where.type = params.type;
  if (params.from || params.to) {
    where.date = {
      ...(params.from ? { gte: startOfDay(params.from) } : {}),
      ...(params.to ? { lte: endOfDay(params.to) } : {}),
    };
  }

  // Agrupado por conta (nome); dentro de cada conta, data mais recente
  // primeiro e, no mesmo dia, entradas antes de saídas.
  const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
    { account: { name: "asc" } },
    { date: "desc" },
    { type: "asc" },
  ];

  const page = Math.max(1, Number(params.page) || 1);

  const [total, transactions, exportRows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: {
        account: true,
        category: true,
        supplier: true,
        // Sem o `content`: são os metadados que a tela precisa, e trazer o
        // binário de cada anexo aqui carregaria megabytes por página para
        // desenhar um nome de arquivo.
        documents: { select: { id: true, fileName: true, size: true }, orderBy: { createdAt: "asc" } },
        // A transacao do fechamento e um resumo do dia; o detalhe (cada
        // sangria, cada pagamento) fica no fechamento. Sem este vinculo a
        // pessoa via "Caixa do dia" e nao tinha como abrir o que compoe.
        cashClosing: { select: { id: true } },
        // Mesma ideia para o repasse: a transacao e o resumo do mes de um
        // medico, e os dias e itens que a compuseram ficam no repasse.
        doctorPayout: {
          select: {
            month: true,
            doctorId: true,
            approvedByName: true,
            doctor: { select: { name: true } },
            entries: {
              select: {
                amount: true,
                lines: {
                  select: {
                    quantity: true,
                    rate: true,
                    serviceItem: { select: { name: true, category: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    // O CSV leva o filtro inteiro, não só a página aberta — exportar uma
    // página de cada vez seria uma armadilha silenciosa.
    prisma.transaction.findMany({
      where,
      orderBy,
      take: EXPORT_LIMIT,
      select: {
        date: true,
        description: true,
        type: true,
        amount: true,
        account: { select: { name: true } },
        category: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    }),
  ]);

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
          <ExportCsvButton
            headers={["Data", "Conta", "Descrição", "Categoria", "Fornecedor", "Tipo", "Valor"]}
            rows={exportRows.map((t) => [
              formatDate(t.date),
              t.account.name,
              t.description,
              t.category?.name ?? "",
              t.supplier?.name ?? "",
              t.type === "INCOME" ? "Entrada" : "Saída",
              Number(t.amount),
            ])}
            fileName={`transacoes-${new Date().toISOString().slice(0, 10)}.csv`}
          />
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
          {/* A key remonta os campos quando o filtro muda. Sem ela, o mesmo
              input recebe um `defaultValue` novo depois de montado, e o Base
              UI avisa que o campo mudou de não-controlado para controlado —
              mesma correção que period-filter e month-range-filter já tinham.
              Os `?? ""` completam: sem eles o campo monta com `undefined`,
              que é a outra metade da mesma transição. */}
          <form
            key={`${params.from ?? ""}|${params.to ?? ""}|${params.accountId ?? ""}|${params.categoryId ?? ""}|${params.supplierId ?? ""}|${params.type ?? ""}`}
            className="flex flex-wrap items-end gap-3"
            method="GET"
          >
            <div className="space-y-1">
              <Label htmlFor="from">De</Label>
              <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">Até</Label>
              <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="accountId">Conta</Label>
              <select
                id="accountId"
                name="accountId"
                defaultValue={params.accountId ?? ""}
                className="h-8 w-44 rounded-lg border border-input bg-background text-foreground px-2.5 text-sm"
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
                className="h-8 w-44 rounded-lg border border-input bg-background text-foreground px-2.5 text-sm"
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
                className="h-8 w-44 rounded-lg border border-input bg-background text-foreground px-2.5 text-sm"
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
                className="h-8 w-36 rounded-lg border border-input bg-background text-foreground px-2.5 text-sm"
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
          <CardTitle>{total} {total === 1 ? "transação" : "transações"}</CardTitle>
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
              anexos: t.documents,
              cashClosingId: t.cashClosing?.id ?? null,
              repasse: t.doctorPayout ? montarRepasse(t.doctorPayout) : null,
            }))}
          />
          <Pagination
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            basePath="/transacoes"
            params={params}
          />
        </CardContent>
      </Card>
    </div>
  );
}
