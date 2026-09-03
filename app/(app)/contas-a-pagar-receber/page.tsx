import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnexosPopover } from "@/components/anexos-popover";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduledFormDialog } from "./scheduled-form-dialog";
import { MarkPaidDialog } from "./mark-paid-dialog";
import { ImportDialog } from "./import-dialog";
import { DeleteButton } from "@/components/delete-button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { deleteScheduledEntry } from "./actions";
import { FiltrosTabela } from "@/components/filtros-tabela";
import { AtalhosPeriodo } from "@/components/atalhos-periodo";
import { Pagination } from "@/components/pagination";
import { POR_PAGINA, lerPagina } from "@/lib/paginacao";
import { accessFor } from "@/lib/access";
import { can } from "@/lib/permissions";
import { parseDateOnly, startOfDay } from "@/lib/date-only";
import type { Prisma } from "@/lib/generated/prisma/client";

function effectiveStatus(status: string, dueDate: Date) {
  return status === "PENDING" && dueDate < new Date() ? "OVERDUE" : status;
}

function statusBadge(status: string, dueDate: Date) {
  const effective = effectiveStatus(status, dueDate);
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    PENDING: { label: "Pendente", variant: "secondary" },
    OVERDUE: { label: "Atrasado", variant: "destructive" },
    PAID: { label: "Pago", variant: "default" },
    CANCELED: { label: "Cancelado", variant: "outline" },
  };
  const { label, variant } = map[effective] ?? map.PENDING;
  return <Badge variant={variant}>{label}</Badge>;
}

interface FiltroEntradas {
  q?: string;
  status?: string;
  categoryId?: string;
  supplierId?: string;
  de?: string;
  ate?: string;
  /** Uma página por aba. As duas listas dividem o mesmo endereço, então um
   * `page` só faria A Receber pular junto com A Pagar — e a pessoa veria a
   * página trocar numa tabela que ela nem estava olhando. */
  pp?: string;
  pr?: string;
  /** Qual aba abrir. A navegação entre páginas recarrega a tela, e sem isso
   * ela voltaria sempre para A Pagar. */
  aba?: string;
}

/** Cada aba carrega o próprio parâmetro de página e o próprio nome de aba. */
const ABA = {
  PAYABLE: { paramName: "pp", valor: "payable" },
  RECEIVABLE: { paramName: "pr", valor: "receivable" },
} as const;

async function EntriesTable({
  companyId,
  type,
  filtro,
}: {
  companyId: string;
  type: "PAYABLE" | "RECEIVABLE";
  filtro: FiltroEntradas;
}) {
  // Quem nao pode baixar nao ve o botao. A action recusa de qualquer forma
  // — isto e a metade da tela, para nao oferecer o que vai dar erro.
  const podeBaixar = can(await accessFor(companyId), "contas-a-pagar-receber", "aprovar");
  // Tudo no banco: a lista cresce todo mes, e filtrar em memoria depois de
  // buscar tudo para de funcionar exatamente quando o filtro passa a ser
  // necessario.
  const where: Prisma.ScheduledEntryWhereInput = { companyId, type };
  if (filtro.q) where.description = { contains: filtro.q, mode: "insensitive" };
  if (filtro.categoryId) where.categoryId = filtro.categoryId;
  if (filtro.supplierId) where.supplierId = filtro.supplierId;
  if (filtro.status === "PENDING" || filtro.status === "PAID") where.status = filtro.status;
  if (filtro.status === "OVERDUE") {
    // "Atrasado" nao e um status guardado: e pendente com vencimento no
    // passado. A tela ja calcula assim no selo; o filtro segue a mesma
    // regra para os dois nao divergirem.
    where.status = "PENDING";
    where.dueDate = { lt: startOfDay(new Date().toISOString().slice(0, 10)) };
  }
  if (filtro.de || filtro.ate) {
    where.dueDate = {
      ...(typeof where.dueDate === "object" && where.dueDate !== null ? where.dueDate : {}),
      ...(filtro.de ? { gte: parseDateOnly(filtro.de) } : {}),
      ...(filtro.ate ? { lte: parseDateOnly(filtro.ate) } : {}),
    };
  }

  const { paramName, valor: aba } = ABA[type];
  const page = lerPagina(filtro[paramName]);

  const [total, entries, accounts, categories, suppliers] = await Promise.all([
    prisma.scheduledEntry.count({ where }),
    prisma.scheduledEntry.findMany({
      where,
      include: {
        account: true,
        category: true,
        supplier: true,
        // Sem o `content`: a tela usa só o nome e o tamanho.
        documents: { select: { id: true, fileName: true, size: true }, orderBy: { createdAt: "asc" } },
      },
      // Vencimento e o id juntos: só a data empata entre lançamentos do
      // mesmo dia, e empate sem desempate faz a mesma linha aparecer em duas
      // páginas — ou em nenhuma.
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      skip: (page - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.account.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
  ]);

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, type: c.type as "INCOME" | "EXPENSE" }));
  const supplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{total} lançamentos</CardTitle>
        <ScheduledFormDialog
          accounts={accountOptions}
          categories={categoryOptions}
          suppliers={supplierOptions}
          defaultType={type}
        />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Vencimento</TableHead>
              <TableHead>Descrição</TableHead>
              {/* Categoria e fornecedor saem em tela estreita — mas nao
                  somem: viram uma segunda linha sob a descricao. Esconder
                  coluna e perder informacao; aqui ela so muda de lugar. */}
              <TableHead className="hidden lg:table-cell">Categoria</TableHead>
              <TableHead className="hidden lg:table-cell">Fornecedor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right whitespace-nowrap">Valor</TableHead>
              <TableHead className="w-36" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhum lançamento com esse filtro.
                </TableCell>
              </TableRow>
            )}
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">{formatDate(entry.dueDate)}</TableCell>
                <TableCell className="max-w-64">
                  <div className="truncate">{entry.description}</div>
                  {(entry.category || entry.supplier) && (
                    <div className="truncate text-xs text-muted-foreground lg:hidden">
                      {[entry.category?.name, entry.supplier?.name].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">{entry.category?.name ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">{entry.supplier?.name ?? "—"}</TableCell>
                <TableCell>{statusBadge(entry.status, entry.dueDate)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                  {formatCurrency(Number(entry.amount))}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <AnexosPopover anexos={entry.documents} titulo={entry.description} />
                    {entry.status === "PENDING" && podeBaixar && (
                      <MarkPaidDialog
                        entryId={entry.id}
                        type={type}
                        accounts={accountOptions}
                        defaultAccountId={entry.accountId}
                      />
                    )}
                    <ScheduledFormDialog
                      accounts={accountOptions}
                      categories={categoryOptions}
                      suppliers={supplierOptions}
                      defaultType={type}
                      entry={{
                        id: entry.id,
                        type: entry.type as "PAYABLE" | "RECEIVABLE",
                        description: entry.description,
                        amount: Number(entry.amount),
                        dueDate: entry.dueDate,
                        accountId: entry.accountId,
                        categoryId: entry.categoryId,
                        supplierId: entry.supplierId,
                        anexos: entry.documents,
                      }}
                    />
                    <DeleteButton action={deleteScheduledEntry.bind(null, entry.id)} title="Excluir lançamento?" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          total={total}
          page={page}
          pageSize={POR_PAGINA}
          basePath="/contas-a-pagar-receber"
          params={{ ...(filtro as Record<string, string | undefined>), aba }}
          paramName={paramName}
          rotulo="lançamentos"
        />
      </CardContent>
    </Card>
  );
}

async function ConsolidatedEntriesSummary({
  companyIds,
  type,
}: {
  companyIds: string[];
  type: "PAYABLE" | "RECEIVABLE";
}) {
  const entries =
    companyIds.length === 0
      ? []
      : await prisma.scheduledEntry.findMany({
          where: { companyId: { in: companyIds }, type },
          include: { company: true },
          orderBy: [{ company: { name: "asc" } }, { dueDate: "asc" }],
        });

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="text-center text-muted-foreground py-8">
          Nenhum lançamento nesse escopo.
        </CardContent>
      </Card>
    );
  }

  interface CompanySummary {
    companyId: string;
    companyName: string;
    pending: number;
    overdue: number;
    paid: number;
    openAmount: number;
    nextDueDate: Date | null;
  }

  const summaries: CompanySummary[] = [];
  for (const entry of entries) {
    let summary = summaries.find((s) => s.companyId === entry.companyId);
    if (!summary) {
      summary = {
        companyId: entry.companyId,
        companyName: entry.company.name,
        pending: 0,
        overdue: 0,
        paid: 0,
        openAmount: 0,
        nextDueDate: null,
      };
      summaries.push(summary);
    }

    const status = effectiveStatus(entry.status, entry.dueDate);
    if (status === "PENDING" || status === "OVERDUE") {
      if (status === "PENDING") summary.pending += 1;
      else summary.overdue += 1;
      summary.openAmount += Number(entry.amount);
      if (!summary.nextDueDate || entry.dueDate < summary.nextDueDate) {
        summary.nextDueDate = entry.dueDate;
      }
    } else if (status === "PAID") {
      summary.paid += 1;
    }
  }
  summaries.sort((a, b) => a.companyName.localeCompare(b.companyName));

  const totalOpen = summaries.reduce((sum, s) => sum + s.openAmount, 0);
  const totalOverdue = summaries.reduce((sum, s) => sum + s.overdue, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {summaries.length} empresa(s) — {formatCurrency(totalOpen)} em aberto
          {totalOverdue > 0 && (
            <span className="text-destructive font-normal ml-2">({totalOverdue} atrasado(s))</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead className="text-right">Pendentes</TableHead>
              <TableHead className="text-right">Atrasados</TableHead>
              <TableHead className="text-right">Total em aberto</TableHead>
              <TableHead>Próximo vencimento</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.map((s) => (
              <TableRow key={s.companyId}>
                <TableCell className="font-medium">{s.companyName}</TableCell>
                <TableCell className="text-right tabular-nums">{s.pending}</TableCell>
                <TableCell className="text-right">
                  {s.overdue > 0 ? (
                    <Badge variant="destructive">{s.overdue}</Badge>
                  ) : (
                    <span className="text-muted-foreground tabular-nums">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(s.openAmount)}
                </TableCell>
                <TableCell>{s.nextDueDate ? formatDate(s.nextDueDate) : "—"}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <SwitchToCompanyButton companyId={s.companyId} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

async function ConsolidatedEntries({ companyIds, scopeLabel }: { companyIds: string[]; scopeLabel: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas a Pagar e a Receber</h1>
        <p className="text-muted-foreground text-sm">
          Resumo por empresa dos lançamentos previstos — {scopeLabel}. Para ver o detalhe linha a linha,
          cadastrar, editar, excluir ou dar baixa num lançamento, entre na empresa específica (use &quot;Ver
          detalhes&quot; ou o menu à esquerda).
        </p>
      </div>

      <Tabs defaultValue="payable">
        <TabsList>
          <TabsTrigger value="payable">A Pagar</TabsTrigger>
          <TabsTrigger value="receivable">A Receber</TabsTrigger>
        </TabsList>
        <TabsContent value="payable" className="mt-4">
          <ConsolidatedEntriesSummary companyIds={companyIds} type="PAYABLE" />
        </TabsContent>
        <TabsContent value="receivable" className="mt-4">
          <ConsolidatedEntriesSummary companyIds={companyIds} type="RECEIVABLE" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface Props {
  searchParams: Promise<FiltroEntradas>;
}

export default async function ContasAPagarReceberPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedEntries companyIds={companyIds} scopeLabel={scopeLabel} />;
  }
  const companyId = scope.companyId;

  const [accounts, categories, suppliers] = await Promise.all([
    prisma.account.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
  ]);
  const importAccountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const importCategoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const importSupplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Contas a Pagar e a Receber</h1>
          <p className="text-muted-foreground text-sm">Previsão de entradas e saídas futuras.</p>
        </div>
        <ImportDialog accounts={importAccountOptions} categories={importCategoryOptions} suppliers={importSupplierOptions} />
      </div>

      <FiltrosTabela
        basePath="/contas-a-pagar-receber"
        valores={params as Record<string, string | undefined>}
        atalhos={
          <AtalhosPeriodo
            basePath="/contas-a-pagar-receber"
            params={params as Record<string, string | undefined>}
            campoDe="de"
            campoAte="ate"
            // A página é por aba, não pelo período — trocar o período não
            // deve fazer a pessoa "perder o lugar" na paginação.
            excluir={["pp", "pr"]}
          />
        }
        campos={[
          { tipo: "busca", name: "q", label: "Descrição", placeholder: "Buscar..." },
          {
            tipo: "select",
            name: "status",
            label: "Situação",
            vazio: "Todas",
            opcoes: [
              { value: "PENDING", label: "Pendente" },
              { value: "OVERDUE", label: "Atrasado" },
              { value: "PAID", label: "Baixado" },
            ],
          },
          {
            tipo: "select",
            name: "categoryId",
            label: "Categoria",
            vazio: "Todas",
            opcoes: importCategoryOptions.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            tipo: "select",
            name: "supplierId",
            label: "Fornecedor",
            vazio: "Todos",
            opcoes: importSupplierOptions.map((s) => ({ value: s.id, label: s.name })),
          },
          { tipo: "data", name: "de", label: "Vence de" },
          { tipo: "data", name: "ate", label: "Vence até" },
        ]}
      />

      <Tabs defaultValue={params.aba === "receivable" ? "receivable" : "payable"}>
        <TabsList>
          <TabsTrigger value="payable">A Pagar</TabsTrigger>
          <TabsTrigger value="receivable">A Receber</TabsTrigger>
        </TabsList>
        <TabsContent value="payable" className="mt-4">
          <EntriesTable companyId={companyId} type="PAYABLE" filtro={params} />
        </TabsContent>
        <TabsContent value="receivable" className="mt-4">
          <EntriesTable companyId={companyId} type="RECEIVABLE" filtro={params} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
