"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { contaAtual } from "@/lib/access";
import { auditar } from "@/lib/audit";
import { formatCurrency } from "@/lib/format";
import { entryAmount } from "@/lib/doctor-period";
import { parseDateOnly } from "@/lib/date-only";
import { runMutation, type ActionState } from "@/lib/actions-utils";

/** A categoria em que o repasse aprovado cai. */
const CATEGORIA_REPASSE = "Repasse Médico";

function revalidateAll() {
  revalidatePath("/repasses-medicos");
  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  revalidatePath("/relatorios");
  revalidatePath("/balanco");
  revalidatePath("/operacao");
}

/** Primeiro dia do mês, meia-noite UTC — a convenção de data do sistema. */
function primeiroDia(mes: string) {
  return parseDateOnly(`${mes}-01`);
}

function ultimoInstante(mes: string) {
  const inicio = primeiroDia(mes);
  return new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1) - 1);
}

async function categoriaRepasse(companyId: string) {
  const existing = await prisma.category.findFirst({
    where: { companyId, name: CATEGORIA_REPASSE, type: "EXPENSE" },
  });
  if (existing) return existing;
  return prisma.category.create({ data: { companyId, name: CATEGORIA_REPASSE, type: "EXPENSE" } });
}

/** Em que conta o repasse sai quando a tela não manda uma escolha.
 *
 * A tela sempre manda `accountId` hoje — este é só o resguardo de quem
 * chamar a ação sem passar por ela (testes, por exemplo). Pegar a
 * primeira em ordem alfabética é a mesma simplificação de antes. */
async function contaPadrao(companyId: string) {
  return prisma.account.findFirst({ where: { companyId }, orderBy: { name: "asc" } });
}

/** Aprova o repasse de um médico num mês e o joga no razão.
 *
 * Só o que ainda não foi aprovado entra: se alguém lançar um dia esquecido
 * depois da aprovação, uma segunda aprovação cria um segundo repasse com a
 * diferença, em vez de duplicar o mês inteiro.
 *
 * `accountId` é de qual conta bancária saiu o pagamento — quem aprova
 * escolhe na tela, porque é isso que faz o extrato da conta bater com o
 * banco depois. Sem ela, cai na conta padrão (primeira em ordem alfabética). */
export async function aprovarRepasse(doctorId: string, mes: string, accountId?: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("repasses-medicos", "aprovar");
    const conta = await contaAtual();

    const [doctor, account] = await Promise.all([
      prisma.doctor.findFirst({ where: { id: doctorId, companyId }, select: { name: true } }),
      accountId
        ? prisma.account.findFirst({ where: { id: accountId, companyId } })
        : contaPadrao(companyId),
    ]);
    if (!doctor) throw new Error("Médico não encontrado.");
    if (!account) {
      throw new Error(
        accountId ? "Conta bancária inválida." : "Cadastre uma conta bancária antes de aprovar repasses."
      );
    }

    const pendentes = await prisma.doctorDailyEntry.findMany({
      where: {
        companyId,
        doctorId,
        payoutId: null,
        date: { gte: primeiroDia(mes), lte: ultimoInstante(mes) },
      },
      include: { lines: true },
    });
    if (pendentes.length === 0) throw new Error("Não há lançamentos pendentes de aprovação neste mês.");

    const total = pendentes.reduce((s, e) => s + entryAmount(e), 0);
    if (total <= 0) throw new Error("O total do mês precisa ser maior que zero.");

    const categoria = await categoriaRepasse(companyId);
    const [ano, m] = mes.split("-");

    // Ja houve aprovacao neste mes? Entao este e um complemento — dia
    // esquecido, lancado depois. Marcar no texto evita duas linhas
    // identicas no extrato.
    const jaAprovado = await prisma.doctorPayout.count({
      where: { companyId, doctorId, month: primeiroDia(mes) },
    });
    const sufixo = jaAprovado > 0 ? " (complemento)" : "";

    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          // Último dia do mês: o repasse é do mês inteiro, e datá-lo em
          // "hoje" jogaria a despesa de agosto no resultado de setembro.
          date: ultimoInstante(mes),
          amount: total,
          type: "EXPENSE",
          description: `Repasse — ${doctor.name} — ${m}/${ano}${sufixo}`,
          companyId,
          accountId: account.id,
          categoryId: categoria.id,
          source: "MANUAL",
        },
      });

      const payout = await tx.doctorPayout.create({
        data: {
          month: primeiroDia(mes),
          amount: total,
          companyId,
          doctorId,
          transactionId: transaction.id,
          approvedByName: conta?.name ?? null,
          approvedById: conta?.id ?? null,
        },
      });

      await tx.doctorDailyEntry.updateMany({
        where: { id: { in: pendentes.map((e) => e.id) } },
        data: { payoutId: payout.id },
      });
    });

    await auditar({
      companyId,
      module: "repasses-medicos",
      acao: "aprovou",
      entidade: `Repasse de ${doctor.name} — ${m}/${ano}`,
      resumo: `${formatCurrency(total)} em ${pendentes.length} lançamento(s) entraram como despesa`,
      registroId: doctorId,
    });

    revalidateAll();
  });
}

/** Desfaz a aprovação: tira a despesa do razão e devolve os dias à edição.
 *
 * Os lançamentos voltam a ficar sem repasse — não são apagados. Corrigir um
 * mês aprovado é caso real, e a alternativa seria refazer tudo à mão. */
export async function reabrirRepasse(payoutId: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("repasses-medicos", "aprovar");

    const payout = await prisma.doctorPayout.findFirst({
      where: { id: payoutId, companyId },
      include: { doctor: { select: { name: true } } },
    });
    if (!payout) throw new Error("Repasse não encontrado.");

    await prisma.$transaction(async (tx) => {
      await tx.doctorDailyEntry.updateMany({ where: { payoutId }, data: { payoutId: null } });
      if (payout.transactionId) {
        await tx.transaction.deleteMany({ where: { id: payout.transactionId, companyId } });
      }
      await tx.doctorPayout.delete({ where: { id: payoutId } });
    });

    await auditar({
      companyId,
      module: "repasses-medicos",
      acao: "reabriu",
      entidade: `Repasse de ${payout.doctor.name}`,
      resumo: `${formatCurrency(Number(payout.amount))} saíram do resultado`,
      registroId: payoutId,
    });

    revalidateAll();
  });
}
