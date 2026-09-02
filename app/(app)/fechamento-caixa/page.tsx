import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { CashClosingFormDialog } from "./cash-closing-form-dialog";
import { CashClosingRow, type CashClosingRowData } from "./cash-closing-row";
import { AnexosPopover } from "@/components/anexos-popover";
import { deleteCashClosing } from "./actions";
import { AcoesFechamento } from "./acoes-fechamento";
import { FiltrosTabela } from "@/components/filtros-tabela";
import { Pagination } from "@/components/pagination";
import { POR_PAGINA, lerPagina, paginaDoIndice } from "@/lib/paginacao";
import { formatCurrency } from "@/lib/format";
import { accessFor } from "@/lib/access";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/lib/generated/prisma/client";
import { formatDate } from "@/lib/format";
import { parseDateOnly } from "@/lib/date-only";

function toLines(lines: { id: string; type: string; label: string; amount: unknown; order: number }[], type: "SANGRIA" | "PAGAMENTO") {
  return lines
    .filter((l) => l.type === type)
    .sort((a, b) => a.order - b.order)
    .map((l) => ({ id: l.id, label: l.label, amount: Number(l.amount) }));
}

const INCLUDE_FECHAMENTO = {
  lines: true,
  account: true,
  // Sem o `content`: a tela usa so o nome e o tamanho, e trazer o binario de
  // cada anexo carregaria megabytes para desenhar um nome de arquivo.
  documents: { select: { id: true, fileName: true, size: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.CashClosingInclude;

type FechamentoCompleto = Prisma.CashClosingGetPayload<{ include: typeof INCLUDE_FECHAMENTO }>;

/** Data mais recente primeiro, id como desempate. Sem o desempate, dois
 * fechamentos do mesmo dia trocam de lugar entre uma consulta e outra — e aí
 * um deles aparece em duas páginas e o outro em nenhuma. */
const ORDEM: Prisma.CashClosingOrderByWithRelationInput[] = [{ date: "desc" }, { id: "asc" }];

function temDiferenca(closing: FechamentoCompleto) {
  const sangrias = toLines(closing.lines, "SANGRIA").reduce((a, l) => a + l.amount, 0);
  const pagamentos = toLines(closing.lines, "PAGAMENTO").reduce((a, l) => a + l.amount, 0);
  return Math.abs(Number(closing.countedCash) - (sangrias - pagamentos)) > 0.004;
}

/** Em que página cai o fechamento `id`, dentro deste filtro e desta ordem.
 *
 * Duas contagens em vez de trazer a lista inteira só para achar um índice: o
 * "vem antes" da ordem (data desc, id asc) vira exatamente este OR. */
async function paginaDoFechamento(where: Prisma.CashClosingWhereInput, id: string) {
  const alvo = await prisma.cashClosing.findFirst({ where: { ...where, id }, select: { date: true } });
  if (!alvo) return null;
  const anteriores = await prisma.cashClosing.count({
    where: {
      ...where,
      OR: [{ date: { gt: alvo.date } }, { date: alvo.date, id: { lt: id } }],
    },
  });
  return paginaDoIndice(anteriores);
}

/** A página pedida, o total que bate com o filtro e a página realmente
 * aberta — que nem sempre é a que veio na URL. */
async function carregarFechamentos(
  where: Prisma.CashClosingWhereInput,
  params: { page?: string; ver?: string; diferenca?: string },
): Promise<{ visiveis: FechamentoCompleto[]; total: number; page: number }> {
  // "Só com diferença" é contado − (sangrias − pagamentos): depende das
  // linhas, que só existem depois de trazer o fechamento. Reproduzir a conta
  // em SQL exigiria uma view só para um filtro pontual — então este é o único
  // caminho que ainda corta em memória, e por isso o único que traz a lista
  // inteira do filtro antes de cortar.
  if (params.diferenca === "1") {
    const todos = (
      await prisma.cashClosing.findMany({ where, include: INCLUDE_FECHAMENTO, orderBy: ORDEM })
    ).filter(temDiferenca);
    const indice = params.ver ? todos.findIndex((c) => c.id === params.ver) : -1;
    const page = params.page === undefined && indice >= 0 ? paginaDoIndice(indice) : lerPagina(params.page);
    const inicio = (page - 1) * POR_PAGINA;
    return { visiveis: todos.slice(inicio, inicio + POR_PAGINA), total: todos.length, page };
  }

  // O atalho que vem de Transações aponta para um fechamento, não para uma
  // página. Sem procurar onde ele caiu, o atalho abriria a página 1 e o
  // fechamento pedido ficaria três páginas adiante, sem pista de que existe.
  const paginaDoAtalho =
    params.page === undefined && params.ver ? await paginaDoFechamento(where, params.ver) : null;
  const page = paginaDoAtalho ?? lerPagina(params.page);

  const [total, visiveis] = await Promise.all([
    prisma.cashClosing.count({ where }),
    prisma.cashClosing.findMany({
      where,
      include: INCLUDE_FECHAMENTO,
      orderBy: ORDEM,
      skip: (page - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);
  return { visiveis, total, page };
}

interface Props {
  /** `?ver=<id>` abre o detalhe daquele fechamento direto — e por onde o
   * atalho vindo de Transacoes chega. */
  searchParams: Promise<{
    ver?: string;
    de?: string;
    ate?: string;
    status?: string;
    accountId?: string;
    diferenca?: string;
    page?: string;
  }>;
}

export default async function FechamentoCaixaPage({ searchParams }: Props) {
  const params = await searchParams;
  const { ver } = params;
  const scope = await getActiveScope();
  const scopeLabel = await getScopeLabel(scope);

  if (scope.type === "company") {
    // O filtro roda no BANCO. Filtrar em memória depois de buscar tudo
    // funciona com um mês de fechamentos e para de funcionar com um ano.
    const where: Prisma.CashClosingWhereInput = { companyId: scope.companyId };
    if (params.de || params.ate) {
      where.date = {
        ...(params.de ? { gte: parseDateOnly(params.de) } : {}),
        ...(params.ate ? { lte: parseDateOnly(params.ate) } : {}),
      };
    }
    if (params.status === "PENDENTE" || params.status === "APROVADO") where.status = params.status;
    if (params.accountId) where.accountId = params.accountId;

    const [{ visiveis, total, page }, accounts, acesso] = await Promise.all([
      carregarFechamentos(where, params),
      prisma.account.findMany({ where: { companyId: scope.companyId }, orderBy: { name: "asc" } }),
      accessFor(scope.companyId),
    ]);
    const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
    const podeAprovar = can(acesso, "fechamento-caixa", "aprovar");

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Fechamento de Caixa</h1>
            <p className="text-muted-foreground text-sm">
              Sangrias e pagamentos em dinheiro do dia, confrontados com a contagem física — {scopeLabel}.
            </p>
          </div>
          <CashClosingFormDialog accounts={accountOptions} />
        </div>

        <FiltrosTabela
          basePath="/fechamento-caixa"
          valores={params as Record<string, string | undefined>}
          campos={[
            { tipo: "data", name: "de", label: "De" },
            { tipo: "data", name: "ate", label: "Até" },
            {
              tipo: "select",
              name: "status",
              label: "Situação",
              vazio: "Todas",
              opcoes: [
                { value: "PENDENTE", label: "Pendente" },
                { value: "APROVADO", label: "Aprovado" },
              ],
            },
            {
              tipo: "select",
              name: "accountId",
              label: "Conta",
              vazio: "Todas",
              opcoes: accountOptions.map((a) => ({ value: a.id, label: a.name })),
            },
            {
              tipo: "select",
              name: "diferenca",
              label: "Conferência",
              vazio: "Todas",
              opcoes: [{ value: "1", label: "Só com diferença" }],
            },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle>{total} fechamento(s)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Data</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Sangrias</TableHead>
                  <TableHead className="text-right">Pagamentos</TableHead>
                  <TableHead className="text-right">Valor do caixa</TableHead>
                  <TableHead className="text-right">Dinheiro contado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nenhum fechamento com esse filtro.
                    </TableCell>
                  </TableRow>
                )}
                {visiveis.map((closing) => {
                  const countedCash = Number(closing.countedCash);
                  const sangrias = toLines(closing.lines, "SANGRIA");
                  const pagamentos = toLines(closing.lines, "PAGAMENTO");
                  const rowData: CashClosingRowData = {
                    id: closing.id,
                    date: closing.date,
                    accountName: closing.account.name,
                    countedCash,
                    notes: closing.notes,
                    sangrias,
                    pagamentos,
                    aprovado: closing.status === "APROVADO",
                    aprovadoPor: closing.approvedByName,
                  };
                  return (
                    <CashClosingRow
                      key={closing.id}
                      closing={rowData}
                      abrirDetalhe={closing.id === ver}
                      actions={
                        <>
                          <AcoesFechamento
                            id={closing.id}
                            aprovado={closing.status === "APROVADO"}
                            podeAprovar={podeAprovar}
                            sangrias={formatCurrency(sangrias.reduce((a, l) => a + l.amount, 0))}
                            pagamentos={formatCurrency(pagamentos.reduce((a, l) => a + l.amount, 0))}
                          />
                          <AnexosPopover
                            anexos={closing.documents}
                            titulo={`Fechamento de ${formatDate(closing.date)}`}
                          />
                          <CashClosingFormDialog
                            accounts={accountOptions}
                            closing={{
                              id: closing.id,
                              date: closing.date,
                              accountId: closing.accountId,
                              countedCash,
                              notes: closing.notes,
                              sangrias,
                              pagamentos,
                              anexos: closing.documents,
                            }}
                          />
                          <DeleteButton
                            action={deleteCashClosing.bind(null, closing.id)}
                            title={`Excluir fechamento de ${formatDate(closing.date)}?`}
                            description="Só é possível excluir fechamento pendente. Some com as linhas e os anexos do dia."
                          />
                        </>
                      }
                    />
                  );
                })}
              </TableBody>
            </Table>
            <Pagination
              total={total}
              page={page}
              pageSize={POR_PAGINA}
              basePath="/fechamento-caixa"
              // Sem o `ver`: ele é o atalho que trouxe a pessoa até aqui, e
              // levá-lo adiante reabriria o detalhe toda vez que ela
              // voltasse para esta página.
              params={{ ...params, ver: undefined }}
              rotulo="fechamentos"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const companyIds = await resolveCompanyIds(scope);
  const closings =
    companyIds.length === 0
      ? []
      : await prisma.cashClosing.findMany({
          where: { companyId: { in: companyIds } },
          include: { lines: true, company: true, account: true },
          orderBy: [{ company: { name: "asc" } }, { date: "desc" }],
        });

  // Resume por empresa (uma linha por empresa, não uma por fechamento) —
  // evita poluir a tela conforme o histórico de fechamentos cresce.
  interface CompanySummary {
    companyId: string;
    companyName: string;
    count: number;
    withDifference: number;
    lastDate: Date;
  }
  const summaries: CompanySummary[] = [];
  for (const closing of closings) {
    const totalSangrias = toLines(closing.lines, "SANGRIA").reduce((s, l) => s + l.amount, 0);
    const totalPagamentos = toLines(closing.lines, "PAGAMENTO").reduce((s, l) => s + l.amount, 0);
    const diferenca = Number(closing.countedCash) - (totalSangrias - totalPagamentos);

    let summary = summaries.find((s) => s.companyId === closing.companyId);
    if (!summary) {
      summary = {
        companyId: closing.companyId,
        companyName: closing.company.name,
        count: 0,
        withDifference: 0,
        lastDate: closing.date,
      };
      summaries.push(summary);
    }
    summary.count += 1;
    if (Math.abs(diferenca) >= 0.005) summary.withDifference += 1;
    if (closing.date > summary.lastDate) summary.lastDate = closing.date;
  }
  summaries.sort((a, b) => a.companyName.localeCompare(b.companyName));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fechamento de Caixa</h1>
        <p className="text-muted-foreground text-sm">
          Resumo por empresa — {scopeLabel}. Para ver os fechamentos de uma unidade, cadastrar, editar ou
          excluir, use &quot;Ver detalhes&quot; ou o menu à esquerda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{summaries.length} empresa(s) com fechamento cadastrado</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Fechamentos</TableHead>
                <TableHead className="text-right">Com diferença</TableHead>
                <TableHead>Último fechamento</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum fechamento nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {summaries.map((s) => (
                <TableRow key={s.companyId}>
                  <TableCell className="font-medium">{s.companyName}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.withDifference > 0 ? (
                      <span className="text-destructive">{s.withDifference}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(s.lastDate)}</TableCell>
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
    </div>
  );
}
