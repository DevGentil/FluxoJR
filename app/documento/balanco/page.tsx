import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { contaAtual, accessOf, companyIdsDaConta } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency, formatDate } from "@/lib/format";
import { startOfDay, endOfDay } from "@/lib/date-only";
import { getPeriodBalanceReport } from "@/lib/balance-report";
import { JRHoldingMark } from "@/components/jr-holding-logo";
import { BarraDocumento } from "../barra";

/** Balanço Executivo do período, no formato que a holding já circula.
 *
 * As três seções e os nomes delas vêm do documento que a diretoria lê hoje:
 *
 * 1. Desempenho operacional — faturamento, despesas e fluxo líquido.
 * 2. Posição de contas — saldo inicial, fluxo, saldo final e a variação por
 *    conta (ou por unidade, quando o escopo abrange mais de uma).
 * 3. Origem das receitas e pagamentos — cada linha com o quanto pesa no total.
 *
 * A barra de proporção da seção 3 não é enfeite: no documento manual é ela
 * que faz "53% da despesa" ser visto antes de ser lido. */

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

/** Últimos sete dias, que é a janela do balanço semanal. */
function periodoPadrao() {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - 6);
  return { from: inicio.toISOString().slice(0, 10), to: hoje.toISOString().slice(0, 10) };
}

export default async function BalancoDocumentoPage({ searchParams }: Props) {
  const params = await searchParams;
  const padrao = periodoPadrao();
  const range = { from: params.from || padrao.from, to: params.to || padrao.to };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) notFound();

  // --- a guarda que o layout do sistema faria, feita aqui ---
  const conta = await contaAtual();
  if (!conta) redirect("/login");

  const visiveis = await companyIdsDaConta(conta);
  const escopo = await getActiveScope(visiveis);
  const companyIds = await resolveCompanyIds(escopo, visiveis);
  const permitidas = companyIds.filter((id) => can(accessOf(conta, id), "balanco", "ver"));
  if (permitidas.length === 0) notFound();
  // --- fim da guarda ---

  const [report, scopeLabel, empresas] = await Promise.all([
    getPeriodBalanceReport(permitidas, startOfDay(range.from), endOfDay(range.to)),
    getScopeLabel(escopo),
    prisma.company.findMany({
      where: { id: { in: permitidas } },
      select: { name: true, cnpj: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const umaEmpresa = empresas.length === 1 ? empresas[0] : null;
  // Com uma unidade, a posição é por conta; com várias, por unidade — é o
  // recorte que responde "onde o dinheiro está" em cada caso.
  const porUnidade = report.companyTotals.length > 1;
  const posicoes = porUnidade
    ? report.companyTotals.map((c) => ({
        id: c.companyId,
        nome: c.companyName,
        abertura: c.opening,
        fechamento: c.closing,
        variacao: c.variation,
      }))
    : report.accounts.map((a) => ({
        id: a.accountId,
        nome: a.accountName,
        abertura: a.opening,
        fechamento: a.closing,
        variacao: a.variation,
      }));

  const emitidoEm = new Date();
  const negativo = report.netFlow < 0;

  return (
    <div className="pagina">
      <BarraDocumento />

      <article className="folha">
        <header className="topo">
          <div className="marca">
            <JRHoldingMark className="h-10 w-10" showWordmark={false} sizes="40px" />
            <div>
              <p className="empresa">{umaEmpresa ? umaEmpresa.name : scopeLabel}</p>
              {umaEmpresa?.cnpj ? (
                <p className="cnpj">CNPJ {umaEmpresa.cnpj}</p>
              ) : (
                empresas.length > 1 && <p className="cnpj">{empresas.length} unidades consolidadas</p>
              )}
            </div>
          </div>
          <div className="titulo">
            <h1>Balanço Executivo</h1>
            <p className="competencia">
              {formatDate(startOfDay(range.from))} a {formatDate(startOfDay(range.to))}
            </p>
          </div>
        </header>

        {/* 1. DESEMPENHO OPERACIONAL */}
        <section className="bloco">
          <h2>1. Desempenho operacional</h2>
          <div className="indicadores">
            <div className="indicador receita">
              <span className="ind-rotulo">Faturamento apurado</span>
              <span className="ind-valor">{formatCurrency(report.revenue)}</span>
            </div>
            <div className="indicador despesa">
              <span className="ind-rotulo">Despesas &amp; pagamentos</span>
              <span className="ind-valor">{formatCurrency(report.expense)}</span>
            </div>
            <div className={`indicador ${negativo ? "despesa" : "receita"}`}>
              <span className="ind-rotulo">Fluxo líquido do período</span>
              <span className={`ind-valor ${negativo ? "negativo" : ""}`}>
                {formatCurrency(report.netFlow)}
              </span>
            </div>
          </div>
          {(report.transfersIn > 0 || report.transfersOut > 0) && (
            <p className="nota">
              Transferências entre empresas do grupo foram isoladas do faturamento e das despesas:{" "}
              {formatCurrency(report.transfersIn)} recebidos e {formatCurrency(report.transfersOut)}{" "}
              enviados no período.
            </p>
          )}
        </section>

        {/* 2. POSIÇÃO DE CONTAS */}
        <section className="bloco">
          <h2>2. Posição {porUnidade ? "por unidade" : "de contas"}</h2>
          <div className="posicao">
            <div className="painel">
              <p className="painel-titulo">Saldo inicial · {formatDate(startOfDay(range.from))}</p>
              <table>
                <tbody>
                  {posicoes.map((p) => (
                    <tr key={`ab-${p.id}`}>
                      <td>{p.nome}</td>
                      <td className="num">{formatCurrency(p.abertura)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total inicial</td>
                    <td className="num">{formatCurrency(report.totalOpening)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="fluxo-meio">
              <span className="rotulo">Fluxo do período</span>
              <span className={`fluxo-valor ${negativo ? "negativo" : "positivo"}`}>
                {formatCurrency(report.netFlow)}
              </span>
            </div>

            <div className="painel">
              <p className="painel-titulo">Saldo atual · {formatDate(startOfDay(range.to))}</p>
              <table>
                <tbody>
                  {posicoes.map((p) => (
                    <tr key={`fe-${p.id}`}>
                      <td>{p.nome}</td>
                      <td className="num">{formatCurrency(p.fechamento)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total consolidado</td>
                    <td className="num">{formatCurrency(report.totalClosing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {posicoes.length > 0 && (
            <>
              <p className="sub-rotulo">Variação do período</p>
              <div className="variacoes">
                {posicoes.map((p) => (
                  <div key={`va-${p.id}`} className="variacao">
                    <span className="var-nome">{p.nome}</span>
                    <span className={`var-valor ${p.variacao < 0 ? "negativo" : "positivo"}`}>
                      {formatCurrency(p.variacao)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* 3. ORIGEM DAS RECEITAS E PAGAMENTOS */}
        <section className="bloco">
          <h2>3. Origem das receitas e pagamentos</h2>
          <div className="origens">
            <Origem
              titulo="Receitas"
              total={report.revenue}
              linhas={report.revenueByCategory}
              tom="receita"
            />
            <Origem
              titulo="Despesas"
              total={report.expense}
              linhas={report.expenseByCategory}
              tom="despesa"
            />
          </div>
        </section>

        <footer className="rodape">
          <p>
            Emitido em {formatDate(emitidoEm)} às{" "}
            {emitidoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · FluxoJR
          </p>
          <p>
            Saldo inicial e final calculados sobre os lançamentos registrados no sistema. O fluxo do
            período é a diferença entre faturamento apurado e despesas pagas.
          </p>
        </footer>
      </article>
    </div>
  );
}

function Origem({
  titulo,
  total,
  linhas,
  tom,
}: {
  titulo: string;
  total: number;
  linhas: { categoryName: string; total: number; percent: number }[];
  tom: "receita" | "despesa";
}) {
  return (
    <div className="origem">
      <p className={`origem-titulo ${tom}`}>
        {titulo} <span>{formatCurrency(total)}</span>
      </p>
      {linhas.length === 0 && <p className="suave">Nada lançado no período.</p>}
      {linhas.map((l) => (
        <div key={l.categoryName} className="origem-linha">
          <div className="origem-topo">
            <span className="origem-nome">{l.categoryName}</span>
            <span className="num">{formatCurrency(l.total)}</span>
          </div>
          {/* A barra repete o número em forma. No documento manual é ela que
              faz "53% da despesa" ser visto antes de ser lido. */}
          <div className="barra-trilho">
            <div className={`barra-preenchida ${tom}`} style={{ width: `${Math.max(l.percent, 1)}%` }} />
          </div>
          <span className="origem-percent">
            {l.percent.toFixed(1)}% do total de {tom === "receita" ? "receitas" : "despesas"}
          </span>
        </div>
      ))}
    </div>
  );
}
