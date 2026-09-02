import { prisma } from "@/lib/prisma";
import type { ScheduledEntry } from "@/lib/generated/prisma/client";

/** O bloco "a vencer" do Dashboard.
 *
 * Mora fora da página por dois motivos: lê o relógio — dentro do corpo do
 * componente, a leitura tornaria o render impuro — e carrega a regra de quanto
 * mostrar de cada natureza, que é o tipo de coisa que precisa de teste. */

const DIA_MS = 24 * 60 * 60 * 1000;

/** A janela do bloco. Trinta dias é o horizonte de quem pergunta "o que vem
 * pela frente" — mais que isso vira planejamento, e planejamento tem tela
 * própria. */
export const DIAS_A_VENCER = 30;

/** Quantos vencimentos mostrar de cada natureza.
 *
 * A cota é POR NATUREZA de propósito. Com um teto único, uma semana cheia de
 * contas a pagar empurrava todos os recebimentos para fora, e o bloco passava
 * a responder "não há nada a receber" quando havia. */
export const VENCIMENTOS_POR_NATUREZA = 5;

/** Teto de segurança da consulta. Trinta dias de previsão não chegam perto
 * disto; existe para uma importação errada não derrubar o Dashboard. */
const TETO = 200;

export interface Vencimentos {
  aPagar: ScheduledEntry[];
  aReceber: ScheduledEntry[];
  /** Quantos existem na janela, não quantos couberam — é o que permite dizer
   * "e mais 4" em vez de cortar calado. */
  totalPagar: number;
  totalReceber: number;
}

export const SEM_VENCIMENTOS: Vencimentos = {
  aPagar: [],
  aReceber: [],
  totalPagar: 0,
  totalReceber: 0,
};

/** Separa a janela nas duas naturezas, cada uma já cortada na cota.
 *
 * Recebe a lista pronta — sem banco, sem relógio — para a regra poder ser
 * exercitada sozinha. */
export function separarPorNatureza(
  janela: ScheduledEntry[],
  porNatureza = VENCIMENTOS_POR_NATUREZA
): Vencimentos {
  const aPagar = janela.filter((e) => e.type === "PAYABLE");
  const aReceber = janela.filter((e) => e.type === "RECEIVABLE");
  return {
    aPagar: aPagar.slice(0, porNatureza),
    aReceber: aReceber.slice(0, porNatureza),
    totalPagar: aPagar.length,
    totalReceber: aReceber.length,
  };
}

/** Os vencimentos dos próximos 30 dias de uma unidade, separados por natureza.
 *
 * Traz a janela inteira numa consulta e corta em memória, em vez de pedir uma
 * fatia de cada natureza ao banco: são dezenas de linhas, e assim o total de
 * cada grupo sai de graça. */
export async function vencimentosProximos(companyIds: string[]): Promise<Vencimentos> {
  if (companyIds.length === 0) return SEM_VENCIMENTOS;

  const janela = await prisma.scheduledEntry.findMany({
    where: {
      companyId: { in: companyIds },
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { lte: new Date(Date.now() + DIAS_A_VENCER * DIA_MS) },
    },
    // Vencimento primeiro, id como desempate: sem ele, dois lançamentos do
    // mesmo dia trocam de lugar entre um carregamento e outro.
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: TETO,
  });

  return separarPorNatureza(janela);
}
