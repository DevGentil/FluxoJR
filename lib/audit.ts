import { prisma } from "@/lib/prisma";
import { contaAtual } from "@/lib/access";
import type { Module } from "@/lib/permissions";
import type { Prisma } from "@/lib/generated/prisma/client";
import { formatCurrency, formatDate } from "@/lib/format";

/** Registro de quem alterou o quê.
 *
 * **Por que chamada explícita, e não automática.** Dava para interceptar toda
 * escrita do Prisma e registrar sozinho, sem risco de alguém esquecer. Não é
 * o certo aqui, por três motivos: quem lê este log é uma pessoa investigando
 * uma divergência, e uma frase ("ECG de Dr. Carlos: R$ 45,00 → R$ 25,00")
 * responde o que um diff de colunas não responde; nem toda escrita merece
 * linha, e a importação de planilha sozinha geraria 2.491 registros de ruído;
 * e o custo de esquecer é baixo perto do custo de um log ilegível.
 *
 * O preço dessa escolha é ter que lembrar de chamar. Por isso o helper pede
 * o texto pronto: se escrever o resumo dá trabalho, é sinal de que a ação
 * mexe em algo que merece registro. */

export type AcaoAuditada = "criou" | "alterou" | "excluiu" | "aprovou" | "reabriu" | "pagou" | "desativou";

interface Evento {
  /** Ausente quando o evento é do sistema e não de uma unidade. */
  companyId?: string;
  /** O nome já resolvido, quando quem chama o tem em mãos.
   *
   * Existe por causa de um estouro real: dentro de uma transação, buscar o
   * nome a cada evento somava uma consulta por item alterado e derrubava o
   * limite de 5 segundos do Prisma ao salvar um médico com vários reajustes.
   * O nome é o mesmo em todos eles — resolver uma vez, fora da transação, e
   * passar aqui. */
  companyName?: string;
  module: Module;
  acao: AcaoAuditada;
  /** Do que se trata, já legível: "Contrato de Dr. Carlos Andrade". */
  entidade: string;
  /** O que mudou, em uma linha: "ECG: R$ 45,00 → R$ 25,00". */
  resumo: string;
  registroId?: string;
}

/** Grava o evento.
 *
 * Aceita a transação como primeiro argumento para o registro entrar junto da
 * alteração: se a operação der meia-volta, o log não fica afirmando algo que
 * não aconteceu. Sem transação, é melhor esforço — mas nunca derruba a
 * operação, porque um sistema que se recusa a salvar por não conseguir
 * escrever o log é pior do que um log com um buraco. */
export async function auditar(evento: Evento, tx?: Prisma.TransactionClient): Promise<void> {
  try {
    const conta = await contaAtual();
    const db = tx ?? prisma;

    // Só consulta quando o nome não veio pronto — e nunca dentro de uma
    // transação, onde cada ida ao banco consome o orçamento de tempo dela.
    const nomeEmpresa =
      evento.companyName ??
      (evento.companyId && !tx
        ? (await db.company.findUnique({ where: { id: evento.companyId }, select: { name: true } }))?.name
        : undefined);

    await db.auditLog.create({
      data: {
        // Conta nula só acontece em modo aberto (desenvolvimento local).
        userId: conta && conta.id !== "dev" ? conta.id : null,
        userName: conta?.name ?? "Desconhecido",
        userEmail: conta?.email ?? "—",
        companyId: evento.companyId ?? null,
        companyName: nomeEmpresa ?? null,
        module: evento.module,
        acao: evento.acao,
        entidade: evento.entidade,
        resumo: evento.resumo,
        registroId: evento.registroId ?? null,
      },
    });
  } catch (e) {
    if (tx) throw e; // dentro da transação, falhar junto é o comportamento certo
    console.error("[auditoria] não foi possível registrar o evento:", e);
  }
}

/** Descreve uma mudança de valor do jeito que se lê: "de → para".
 *
 * Devolve `null` quando nada mudou, para a ação não gravar um registro
 * dizendo que alterou o que continua igual. */
export function diff(rotulo: string, antes: unknown, depois: unknown): string | null {
  const a = formatar(antes);
  const d = formatar(depois);
  return a === d ? null : `${rotulo}: ${a} → ${d}`;
}

function formatar(v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (v instanceof Date) return formatDate(v);
  // Decimal do Prisma: dinheiro que veio do banco.
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return dinheiro(Number((v as { toNumber(): number }).toNumber()));
  }
  if (typeof v === "number") return dinheiro(v);
  return String(v);
}

/** Usa o formatador do sistema e troca o espaço não-quebrável do "R$ " por um
 * espaço comum. O log é texto guardado e depois procurado — quem for buscar
 * "R$ 45,00" digita espaço normal, e não acharia com o caractere invisível. */
function dinheiro(n: number) {
  return formatCurrency(n).replace(/\u00a0/g, " ");
}

/** Junta as mudanças numa frase só, descartando o que não mudou. */
export function resumirMudancas(...partes: (string | null)[]): string | null {
  const mudou = partes.filter((p): p is string => p !== null);
  return mudou.length === 0 ? null : mudou.join(" · ");
}
