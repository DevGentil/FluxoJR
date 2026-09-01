import { prisma } from "@/lib/prisma";
import { contaAtual } from "@/lib/access";
import { startOfMonth, toMonthKey } from "@/lib/date-only";
import { formatMonth } from "@/lib/format";

/** Mês fechado não se altera.
 *
 * `paid` sempre disse que o repasse foi pago, e nunca impediu nada: um
 * lançamento de janeiro pago em fevereiro continuava editável e apagável.
 * Marcar não é proteger. O fechamento é o que fecha.
 *
 * O corte é por MÊS e não por lançamento porque é assim que a operação
 * pensa: fecha-se agosto, não se fecha o dia 14. E porque proteger só o que
 * está marcado como pago deixaria de fora exatamente o caso perigoso — um
 * lançamento esquecido sem marcar, dentro de um mês já conferido e pago. */

/** A chave do mês a que uma data pertence, no formato do sistema. */
export function mesDe(data: Date): string {
  return toMonthKey(data);
}

export class PeriodoFechadoError extends Error {
  constructor(mes: string) {
    super(
      `${formatMonth(mes)} está fechado. Para alterar, reabra o mês em Lançamentos — só o gestor da unidade ou a holding podem.`
    );
    this.name = "PeriodoFechadoError";
  }
}

/** Barra a operação quando a data cai num mês já fechado.
 *
 * Chamada pelas actions de lançamento antes de gravar. Recebe a data porque
 * o que importa não é quando se está mexendo, é a que mês o lançamento
 * pertence: alterar hoje um dia de março é mexer em março. */
export async function exigePeriodoAberto(companyId: string, data: Date): Promise<void> {
  const fechado = await prisma.periodClosing.findUnique({
    where: { companyId_month: { companyId, month: startOfMonth(toMonthKey(data)) } },
    select: { id: true },
  });
  if (fechado) throw new PeriodoFechadoError(toMonthKey(data));
}

/** Os meses fechados de uma unidade, como conjunto de chaves "2026-08".
 *
 * Uma consulta só para a tela inteira — sem isso, uma lista com doze meses
 * faria doze perguntas ao banco para desenhar doze cadeados. */
export async function mesesFechados(companyIds: string[]): Promise<Set<string>> {
  if (companyIds.length === 0) return new Set();
  const fechamentos = await prisma.periodClosing.findMany({
    where: { companyId: { in: companyIds } },
    select: { month: true },
  });
  return new Set(fechamentos.map((f) => toMonthKey(f.month)));
}

/** Quem pode reabrir um mês.
 *
 * Assimetria de propósito: o financeiro fecha, mas não desfaz. Reabrir é
 * admitir que o que foi conferido e pago precisa mudar, e essa decisão é de
 * quem responde pela unidade. Um cadeado que quem fechou abre sozinho é
 * um cadeado com a chave pendurada. */
export async function podeReabrir(companyId: string): Promise<boolean> {
  const conta = await contaAtual();
  if (!conta) return false;
  return conta.holding || conta.papeis.get(companyId) === "GESTOR";
}
