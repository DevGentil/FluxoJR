"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getActiveCompanyId } from "@/lib/scope";
import { contaAtual } from "@/lib/access";
import { podeReabrir } from "@/lib/period-lock";
import { startOfMonth } from "@/lib/date-only";
import { formatMonth } from "@/lib/format";
import { auditar } from "@/lib/audit";
import { revalidateRepassesModule } from "@/lib/revalidate-repasses";
import { runMutation, type ActionState } from "@/lib/actions-utils";

/** Fecha o mês.
 *
 * Exige nível "aprovar" em Lançamentos — o mesmo aval que o financeiro dá ao
 * repasse. Fechar é dizer "conferi e está pago", e quem lança não pode ser
 * quem confere o próprio lançamento. */
export async function fecharMes(mes: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("repasses-medicos", "aprovar");
    const conta = await contaAtual();

    const month = startOfMonth(mes);
    const existente = await prisma.periodClosing.findUnique({
      where: { companyId_month: { companyId, month } },
    });
    if (existente) throw new Error(`${formatMonth(mes)} já está fechado.`);

    const empresa = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    // Quantos lançamentos o mês trava — o número é a informação que falta
    // para a decisão ser consciente, e vale no log mais do que a data.
    const lancamentos = await prisma.doctorDailyEntry.count({
      where: { companyId, date: { gte: month, lt: startOfMonth(proximoMes(mes)) } },
    });

    await prisma.periodClosing.create({
      data: {
        companyId,
        month,
        closedByName: conta?.name ?? "Desconhecido",
        closedById: conta && conta.id !== "dev" ? conta.id : null,
      },
    });

    await auditar({
      companyId,
      companyName: empresa?.name,
      module: "repasses-medicos",
      acao: "aprovou",
      entidade: `Fechamento de ${formatMonth(mes)}`,
      resumo: `${lancamentos} lançamento(s) travados contra alteração`,
    });

    revalidateRepassesModule();
  });
}

/** Reabre o mês.
 *
 * Só gestor da unidade ou holding — ver `podeReabrir`. O financeiro fecha e
 * não desfaz: um cadeado que quem fechou abre sozinho é um cadeado com a
 * chave pendurada. */
export async function reabrirMes(mes: string, motivo: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("repasses-medicos", "aprovar");

    if (!(await podeReabrir(companyId))) {
      throw new Error(
        "Só o gestor da unidade ou a holding podem reabrir um mês fechado. Peça a quem responde pela unidade."
      );
    }
    // Reabrir sem dizer por quê tira metade do valor do registro: em seis
    // meses, "reabriu agosto" não explica nada; "reabriu agosto — repasse do
    // Dr. X lançado em duplicidade" explica.
    const razao = motivo.trim();
    if (razao.length < 5) throw new Error("Explique em uma frase por que o mês precisa ser reaberto.");

    const month = startOfMonth(mes);
    const fechamento = await prisma.periodClosing.findUnique({
      where: { companyId_month: { companyId, month } },
    });
    if (!fechamento) throw new Error(`${formatMonth(mes)} não está fechado.`);

    const empresa = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    await prisma.periodClosing.delete({ where: { id: fechamento.id } });

    await auditar({
      companyId,
      companyName: empresa?.name,
      module: "repasses-medicos",
      acao: "alterou",
      entidade: `Fechamento de ${formatMonth(mes)}`,
      resumo: `mês reaberto (fechado por ${fechamento.closedByName}) — ${razao}`,
    });

    revalidateRepassesModule();
  });
}

/** "2026-08" -> "2026-09", sem passar por Date para não escorregar de fuso. */
function proximoMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
}
