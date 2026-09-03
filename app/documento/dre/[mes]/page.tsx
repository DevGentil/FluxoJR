import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { contaAtual, accessOf, companyIdsDaConta } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { montarDre, limitesDoMes } from "@/lib/dre";
import { JRHoldingMark } from "@/components/jr-holding-logo";
import { BarraDocumento } from "../../barra";

/** DRE de uma competência, no formato da planilha que a contabilidade já
 * recebe: faturamento bruto no topo, despesas analíticas agrupadas por
 * classificação financeira e o fecho com receitas, despesas e resultado.
 *
 * A ordem e os nomes das seções não são escolha de layout — são o que o
 * contador já lê todo mês. Mudá-los obrigaria alguém do outro lado a
 * reaprender o documento.
 *
 * Como o demonstrativo de repasse, mora fora do grupo `(app)` e por isso
 * repete a guarda de leitura que o layout do sistema faria. */

interface Props {
  params: Promise<{ mes: string }>;
}

export default async function DrePage({ params }: Props) {
  const { mes } = await params;
  if (!limitesDoMes(mes)) notFound();

  // --- a guarda que o layout do sistema faria, feita aqui ---
  const conta = await contaAtual();
  if (!conta) redirect("/login");

  const visiveis = await companyIdsDaConta(conta);
  const escopo = await getActiveScope(visiveis);
  const companyIds = await resolveCompanyIds(escopo, visiveis);
  // O DRE é o resultado da unidade: quem não pode abrir Relatórios não o vê.
  const permitidas = companyIds.filter((id) => can(accessOf(conta, id), "relatorios", "ver"));
  if (permitidas.length === 0) notFound();
  // --- fim da guarda ---

  const [dre, scopeLabel, empresas] = await Promise.all([
    montarDre(permitidas, mes),
    getScopeLabel(escopo),
    prisma.company.findMany({
      where: { id: { in: permitidas } },
      select: { name: true, cnpj: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const umaEmpresa = empresas.length === 1 ? empresas[0] : null;
  const emitidoEm = new Date();
  const prejuizo = dre.resultado < 0;

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
                empresas.length > 1 && (
                  <p className="cnpj">{empresas.length} unidades consolidadas</p>
                )
              )}
            </div>
          </div>
          <div className="titulo">
            <h1>Demonstrativo de Resultado</h1>
            <p className="competencia">Competência {formatMonth(mes)}</p>
          </div>
        </header>

        {/* 1. FATURAMENTO BRUTO — a planilha abre dizendo de onde vem o
            dinheiro, com o total geral fechando o bloco. */}
        <section className="bloco">
          <h2>Faturamento bruto</h2>
          <table>
            <tbody>
              {dre.faturamento.map((linha) => (
                <tr key={linha.rotulo}>
                  <td>{linha.rotulo}</td>
                  <td className="num">{formatCurrency(linha.valor)}</td>
                </tr>
              ))}
              {dre.faturamento.length === 0 && (
                <tr>
                  <td className="suave">Nenhuma receita lançada na competência.</td>
                  <td className="num">{formatCurrency(0)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>Total geral</td>
                <td className="num">{formatCurrency(dre.receitaTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* 2. DESPESAS ANALÍTICAS — um bloco por classificação financeira,
            lançamento a lançamento, com subtotal. É a parte que o contador
            confere linha por linha. */}
        {dre.grupos.map((grupo) => (
          <section key={grupo.classificacao} className="bloco grupo-dre">
            <h2>
              {grupo.classificacao}
              <span className="categoria-financeira">{grupo.categoriaFinanceira}</span>
            </h2>
            <table>
              <thead>
                <tr>
                  <th className="col-data">Vencimento</th>
                  <th>Favorecido</th>
                  <th>Descrição</th>
                  <th className="num">Valor pago</th>
                </tr>
              </thead>
              <tbody>
                {grupo.lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap tabular">{formatDate(l.data)}</td>
                    <td>{l.favorecido}</td>
                    <td className="suave">{l.descricao}</td>
                    <td className="num">{formatCurrency(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total em {grupo.classificacao.toLowerCase()}</td>
                  <td className="num">{formatCurrency(grupo.total)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        ))}

        {dre.grupos.length === 0 && (
          <p className="vazio">Nenhuma despesa lançada em {formatMonth(mes)}.</p>
        )}

        {/* 3. O FECHO — as três linhas que a diretoria lê primeiro. */}
        <section className="fecho">
          <div className="fecho-linha">
            <span>Receitas</span>
            <strong>{formatCurrency(dre.receitaTotal)}</strong>
          </div>
          <div className="fecho-linha">
            <span>Despesas</span>
            <strong>{formatCurrency(dre.despesaTotal)}</strong>
          </div>
          <div className={`fecho-linha resultado ${prejuizo ? "prejuizo" : "lucro"}`}>
            <span>{prejuizo ? "Prejuízo apurado" : "Lucro apurado"}</span>
            <strong>{formatCurrency(dre.resultado)}</strong>
          </div>
        </section>

        <footer className="rodape">
          <p>
            Emitido em {formatDate(emitidoEm)} às{" "}
            {emitidoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · FluxoJR ·{" "}
            {dre.quantidade} lançamento(s) na competência
          </p>
          <p>
            Regime de caixa: cada lançamento entra na data em que foi pago ou recebido. Transferências
            entre empresas do grupo não compõem faturamento nem despesa.
          </p>
        </footer>
      </article>
    </div>
  );
}
