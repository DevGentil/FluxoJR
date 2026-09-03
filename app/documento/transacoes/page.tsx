import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { contaAtual, accessOf, companyIdsDaConta } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getActiveScope, resolveCompanyIds } from "@/lib/scope";
import { formatCurrency, formatDate } from "@/lib/format";
import { startOfDay, endOfDay } from "@/lib/date-only";
import { JRHoldingMark } from "@/components/jr-holding-logo";
import { BarraDocumento } from "../barra";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Extrato de transações em PDF — o mesmo filtro que está na tela, num
 * documento para imprimir ou mandar por fora do sistema.
 *
 * "Exportar é o que está na tela": os parâmetros de filtro chegam pela URL
 * exatamente como a página de Transações os usa, e a consulta aqui é a
 * mesma — outro filtro no PDF do que na tela seria a armadilha silenciosa
 * que a paginação já ensinou a evitar.
 *
 * Agrupado por conta, como a tela agrupa: cada conta principio vira uma
 * seção com subtotal, e o total geral fecha o documento. Um extrato sem
 * nenhuma soma no meio do caminho é só uma lista — a conferência acontece
 * seção por seção, não só no fim. */

const EXPORT_LIMIT = 10_000;

interface Props {
  searchParams: Promise<{
    q?: string;
    accountId?: string;
    categoryId?: string;
    supplierId?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}

function periodoLabel(from?: string, to?: string): string {
  if (from && to) return `${formatDate(startOfDay(from))} a ${formatDate(startOfDay(to))}`;
  if (from) return `A partir de ${formatDate(startOfDay(from))}`;
  if (to) return `Até ${formatDate(startOfDay(to))}`;
  return "Todo o período";
}

export default async function ExtratoTransacoesPage({ searchParams }: Props) {
  const params = await searchParams;

  // --- a guarda que o layout do sistema faria, feita aqui ---
  const conta = await contaAtual();
  if (!conta) redirect("/login");

  const visiveis = await companyIdsDaConta(conta);
  const escopo = await getActiveScope(visiveis);
  // O extrato é sempre de UMA unidade — a visão consolidada da holding
  // resume por empresa, e um extrato linha a linha ali misturaria contas,
  // categorias e fornecedores de casas diferentes debaixo do mesmo total.
  if (escopo.type !== "company") notFound();
  if (!can(accessOf(conta, escopo.companyId), "transacoes", "ver")) notFound();
  const companyIds = await resolveCompanyIds(escopo, visiveis);
  if (!companyIds.includes(escopo.companyId)) notFound();
  const companyId = escopo.companyId;
  // --- fim da guarda ---

  // Mesmo filtro que app/(app)/transacoes/page.tsx monta — de propósito
  // duplicado, e não importado de lá: aquela consulta inclui anexos,
  // fechamento e repasse vinculados, que este documento não usa.
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

  const [total, transactions, empresa, conta_, categoria, fornecedor] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { account: true, category: true, supplier: true },
      orderBy: [{ account: { name: "asc" } }, { date: "desc" }, { type: "asc" }],
      take: EXPORT_LIMIT,
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, cnpj: true } }),
    params.accountId
      ? prisma.account.findUnique({ where: { id: params.accountId }, select: { name: true } })
      : null,
    params.categoryId
      ? prisma.category.findUnique({ where: { id: params.categoryId }, select: { name: true } })
      : null,
    params.supplierId
      ? prisma.supplier.findUnique({ where: { id: params.supplierId }, select: { name: true } })
      : null,
  ]);
  if (!empresa) notFound();

  const porConta = new Map<string, typeof transactions>();
  for (const t of transactions) {
    const chave = t.account.name;
    const lista = porConta.get(chave) ?? [];
    lista.push(t);
    porConta.set(chave, lista);
  }
  const contas = [...porConta.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));

  const entradas = transactions.filter((t) => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
  const saidas = transactions.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0);

  const filtrosAtivos = [
    conta_ && `Conta: ${conta_.name}`,
    categoria && `Categoria: ${categoria.name}`,
    fornecedor && `Fornecedor: ${fornecedor.name}`,
    params.type === "INCOME" ? "Só entradas" : params.type === "EXPENSE" ? "Só saídas" : null,
    params.q && `Descrição contém "${params.q}"`,
  ].filter(Boolean) as string[];

  const emitidoEm = new Date();

  return (
    <div className="pagina">
      <BarraDocumento />

      <article className="folha">
        <header className="topo">
          <div className="marca">
            <JRHoldingMark className="h-10 w-10" showWordmark={false} sizes="40px" />
            <div>
              <p className="empresa">{empresa.name}</p>
              {empresa.cnpj && <p className="cnpj">CNPJ {empresa.cnpj}</p>}
            </div>
          </div>
          <div className="titulo">
            <h1>Extrato de Transações</h1>
            <p className="competencia">{periodoLabel(params.from, params.to)}</p>
          </div>
        </header>

        <section className="identificacao">
          <div>
            <span className="rotulo">Lançamentos</span>
            <span className="valor">{total}</span>
          </div>
          <div>
            <span className="rotulo">Contas</span>
            <span className="valor">{contas.length}</span>
          </div>
          <div style={{ gridColumn: filtrosAtivos.length > 0 ? "span 2" : undefined }}>
            <span className="rotulo">Filtros aplicados</span>
            <span className="valor" style={{ fontWeight: 500, fontSize: 12 }}>
              {filtrosAtivos.length > 0 ? filtrosAtivos.join(" · ") : "Nenhum — extrato completo"}
            </span>
          </div>
        </section>

        <section className="bloco">
          <div className="indicadores">
            <div className="indicador receita">
              <span className="ind-rotulo">Entradas</span>
              <span className="ind-valor">{formatCurrency(entradas)}</span>
            </div>
            <div className="indicador despesa">
              <span className="ind-rotulo">Saídas</span>
              <span className="ind-valor">{formatCurrency(saidas)}</span>
            </div>
            <div className={`indicador ${entradas - saidas < 0 ? "despesa" : "receita"}`}>
              <span className="ind-rotulo">Resultado</span>
              <span className={`ind-valor ${entradas - saidas < 0 ? "negativo" : ""}`}>
                {formatCurrency(entradas - saidas)}
              </span>
            </div>
          </div>
        </section>

        {contas.map(([nomeConta, linhas]) => {
          const totalConta = linhas.reduce(
            (s, t) => s + (t.type === "INCOME" ? Number(t.amount) : -Number(t.amount)),
            0
          );
          return (
            <section key={nomeConta} className="bloco grupo-dre">
              <h2>
                {nomeConta}
                <span className="categoria-financeira">
                  {linhas.length} {linhas.length === 1 ? "lançamento" : "lançamentos"}
                </span>
              </h2>
              <table>
                <thead>
                  <tr>
                    <th className="col-data">Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Fornecedor</th>
                    <th>Tipo</th>
                    <th className="num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((t) => (
                    <tr key={t.id}>
                      <td className="tabular nowrap">{formatDate(t.date)}</td>
                      <td>{t.description}</td>
                      <td className="suave">{t.category?.name ?? "—"}</td>
                      <td className="suave">{t.supplier?.name ?? "—"}</td>
                      <td className="suave">{t.type === "INCOME" ? "Entrada" : "Saída"}</td>
                      <td className="num">
                        {t.type === "EXPENSE" ? "-" : ""}
                        {formatCurrency(Number(t.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Total em {nomeConta}</td>
                    <td className="num">{formatCurrency(totalConta)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>
          );
        })}

        {contas.length === 0 && <p className="vazio">Nenhuma transação com esse filtro.</p>}

        {total > transactions.length && (
          <section className="aviso">
            <p>
              <strong>Documento truncado</strong> — o filtro encontrou {total} lançamentos, e este extrato
              mostra os {transactions.length} mais recentes.
            </p>
            <p className="explica">Refine o filtro por período ou conta para um extrato completo.</p>
          </section>
        )}

        <section className="total">
          <span>Resultado do extrato</span>
          <strong>{formatCurrency(entradas - saidas)}</strong>
        </section>

        <footer className="rodape">
          <p>
            Emitido em {formatDate(emitidoEm)} às{" "}
            {emitidoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · FluxoJR
          </p>
          <p>Valores lançados no sistema, na moeda e no regime em que foram registrados.</p>
        </footer>
      </article>
    </div>
  );
}
