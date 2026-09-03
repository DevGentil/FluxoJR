import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { contaAtual, accessOf, companyIdsDaConta } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getActiveScope, resolveCompanyIds } from "@/lib/scope";
import { formatCurrency, formatDate, formatMonth, formatWeekday } from "@/lib/format";
import { demonstrativoDe } from "@/lib/repasse-demonstrativo";
import { JRHoldingMark } from "@/components/jr-holding-logo";
import { BotoesDemonstrativo } from "./botoes";

/** Demonstrativo de repasse de um médico num mês — o documento que sai do
 * sistema e chega na mão de alguém de fora.
 *
 * Mora FORA do grupo `(app)` de propósito: um papel não leva menu lateral,
 * cabeçalho de escopo nem botão de sair. O preço disso é que a guarda de
 * leitura do layout não passa por aqui, então esta página checa sessão,
 * escopo e permissão por conta própria — é a única tela do sistema que
 * precisa fazer isso, e é por isso que a checagem está no topo e comentada.
 *
 * O PDF sai pela impressão do navegador. É o caminho que dá o melhor
 * resultado sem trazer um Chromium de 300MB para o deploy: o mesmo motor que
 * desenha esta página desenha o arquivo, com as fontes e o espaçamento
 * exatos que estão aqui. */

interface Props {
  params: Promise<{ doctorId: string; mes: string }>;
}

/** "2026-08" — o mês de competência, como vem da URL. */
function limitesDoMes(mes: string): { inicio: Date; fim: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(mes)) return null;
  const [ano, m] = mes.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return {
    inicio: new Date(Date.UTC(ano, m - 1, 1)),
    fim: new Date(Date.UTC(ano, m, 0, 23, 59, 59, 999)),
  };
}

export default async function DemonstrativoPage({ params }: Props) {
  const { doctorId, mes } = await params;
  const periodo = limitesDoMes(mes);
  if (!periodo) notFound();

  // --- a guarda que o layout do sistema faria, feita aqui ---
  const conta = await contaAtual();
  if (!conta) redirect("/login");

  const visiveis = await companyIdsDaConta(conta);
  const escopo = await getActiveScope(visiveis);
  const companyIds = await resolveCompanyIds(escopo, visiveis);

  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, companyId: { in: companyIds } },
    include: { company: { select: { name: true, cnpj: true } } },
  });
  if (!doctor) notFound();
  if (!can(accessOf(conta, doctor.companyId), "repasses-medicos", "ver")) notFound();
  // --- fim da guarda ---

  const [lancamentos, fechamento] = await Promise.all([
    prisma.doctorDailyEntry.findMany({
      where: { doctorId: doctor.id, date: { gte: periodo.inicio, lte: periodo.fim } },
      include: { lines: { include: { serviceItem: { select: { name: true, category: true } } } } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    // O selo de "mês fechado" é o que separa um rascunho de um documento que
    // vale conferência: enquanto o mês está aberto, o número ainda pode mudar.
    prisma.periodClosing.findFirst({
      where: { companyId: doctor.companyId, month: periodo.inicio },
    }),
  ]);

  const demonstrativo = demonstrativoDe(lancamentos);
  const dias = lancamentos.map((e) => ({
    id: e.id,
    date: e.date,
    itens: e.lines.map((l) => `${Number(l.quantity)}× ${l.serviceItem.name}`).join(", "),
    valor:
      e.lines.length > 0
        ? e.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.rate), 0)
        : Number(e.amount ?? 0),
  }));

  const emitidoEm = new Date();

  return (
    <div className="pagina">
      <BotoesDemonstrativo />

      <article className="folha">
        <header className="topo">
          <div className="marca">
            <JRHoldingMark className="h-10 w-10" showWordmark={false} sizes="40px" />
            <div>
              <p className="empresa">{doctor.company.name}</p>
              {doctor.company.cnpj && <p className="cnpj">CNPJ {doctor.company.cnpj}</p>}
            </div>
          </div>
          <div className="titulo">
            <h1>Demonstrativo de Repasse</h1>
            <p className="competencia">{formatMonth(mes)}</p>
          </div>
        </header>

        <section className="identificacao">
          <div>
            <span className="rotulo">Médico</span>
            <span className="valor">{doctor.name}</span>
          </div>
          <div>
            <span className="rotulo">Especialidade</span>
            <span className="valor">{doctor.specialty}</span>
          </div>
          <div>
            <span className="rotulo">Situação do mês</span>
            <span className={`valor ${fechamento ? "fechado" : "aberto"}`}>
              {fechamento ? `Fechado em ${formatDate(fechamento.closedAt)}` : "Em aberto"}
            </span>
          </div>
        </section>

        {demonstrativo.grupos.length > 0 && (
          <section className="resumo">
            {demonstrativo.grupos.map((g) => (
              <div key={g.categoria} className="cartao">
                <span className="cartao-rotulo">{g.rotulo}</span>
                <span className="cartao-qtd">{g.quantidade}</span>
                <span className="cartao-valor">{formatCurrency(g.total)}</span>
              </div>
            ))}
          </section>
        )}

        {demonstrativo.grupos.map((grupo) => (
          <section key={grupo.categoria} className="bloco">
            <h2>{grupo.rotulo}</h2>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Quantidade</th>
                  <th className="num">Valor unitário</th>
                  <th className="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {grupo.itens.map((item) => (
                  <tr key={`${item.item}-${item.taxa}`}>
                    <td>{item.item}</td>
                    <td className="num">{item.quantidade}</td>
                    <td className="num suave">{formatCurrency(item.taxa)}</td>
                    <td className="num">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total em {grupo.rotulo.toLowerCase()}</td>
                  <td className="num">{formatCurrency(grupo.total)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        ))}

        {demonstrativo.diasSemDetalhe > 0 && (
          // Nunca somar isto dentro dos grupos: o médico precisa saber
          // exatamente quais linhas ele NÃO consegue conferir item a item.
          <section className="aviso">
            <p>
              <strong>
                {demonstrativo.diasSemDetalhe}{" "}
                {demonstrativo.diasSemDetalhe === 1 ? "dia lançado" : "dias lançados"} como valor fechado
              </strong>{" "}
              — {formatCurrency(demonstrativo.totalSemDetalhe)}
            </p>
            <p className="explica">
              Esses dias entraram com o valor combinado do dia, sem a lista do que foi atendido. Estão
              somados no total abaixo, mas não aparecem no detalhamento por item.
            </p>
          </section>
        )}

        {dias.length > 0 && (
          <section className="bloco">
            <h2>Dias lançados</h2>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Atendimentos</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {dias.map((d) => (
                  <tr key={d.id}>
                    <td className="nowrap">
                      {formatDate(d.date)} <span className="suave">{formatWeekday(d.date)}</span>
                    </td>
                    <td className="suave">{d.itens || "Valor do dia"}</td>
                    <td className="num">{formatCurrency(d.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="total">
          <span>Total a repassar</span>
          <strong>{formatCurrency(demonstrativo.total)}</strong>
        </section>

        {dias.length === 0 && (
          <p className="vazio">Nenhum lançamento para este médico em {formatMonth(mes)}.</p>
        )}

        <footer className="rodape">
          <p>
            Emitido em {formatDate(emitidoEm)} às{" "}
            {emitidoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · FluxoJR
          </p>
          <p>
            Documento para conferência. Divergências devem ser apontadas antes do pagamento do mês de{" "}
            {formatMonth(mes)}.
          </p>
        </footer>
      </article>
    </div>
  );
}
