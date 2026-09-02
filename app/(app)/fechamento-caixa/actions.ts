"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { contaAtual } from "@/lib/access";
import { parseDateOnly } from "@/lib/date-only";
import { validarAnexos } from "@/lib/anexos";
import { auditar } from "@/lib/audit";
import { formatCurrency, formatDate } from "@/lib/format";

/** As duas categorias que o fechamento alimenta.
 *
 * Separadas de propósito: a sangria é receita e o pagamento é despesa, e
 * jogá-los na mesma categoria faria o relatório mostrar um número que não
 * é nem uma coisa nem outra. */
const CATEGORIA_SANGRIA = "Sangria Caixa";
const CATEGORIA_PAGAMENTO = "Pagamentos em Dinheiro";

export interface CashClosingLineInput {
  label: string;
  amount: number;
}

export interface CashClosingInput {
  date: string;
  accountId: string;
  countedCash: number;
  notes?: string;
  sangrias: CashClosingLineInput[];
  pagamentos: CashClosingLineInput[];
  /** Nota ou recibo dos pagamentos em dinheiro do dia. Opcional: o
   * fechamento não pode ficar refém de ter o papel em mãos. */
  anexos?: File[];
}

function validate(input: CashClosingInput): string | null {
  if (!input.date) return "Informe a data do fechamento.";
  if (!input.accountId) return "Selecione a conta.";
  if (!Number.isFinite(input.countedCash)) return "Informe o valor de dinheiro contado.";
  const lines = [...input.sangrias, ...input.pagamentos];
  if (lines.length === 0) return "Adicione ao menos uma sangria ou pagamento.";
  for (const line of lines) {
    if (!line.label.trim()) return "Toda linha precisa de uma descrição.";
    if (!Number.isFinite(line.amount) || line.amount <= 0) return "Todo valor deve ser maior que zero.";
  }
  return null;
}

function revalidateAll() {
  revalidatePath("/fechamento-caixa");
  revalidatePath("/dashboard");
  revalidatePath("/transacoes");
  revalidatePath("/relatorios");
  revalidatePath("/balanco");
}

function somar(linhas: { amount: number }[]) {
  return linhas.reduce((s, l) => s + l.amount, 0);
}

function dataBR(data: string) {
  return data.split("-").reverse().join("/");
}

async function categoria(companyId: string, name: string, type: "INCOME" | "EXPENSE") {
  const existing = await prisma.category.findFirst({ where: { companyId, name, type } });
  if (existing) return existing;
  return prisma.category.create({ data: { companyId, name, type } });
}

export async function createCashClosing(input: CashClosingInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId("fechamento-caixa");

    const account = await prisma.account.findFirst({ where: { id: input.accountId, companyId } });
    if (!account) return { error: "Conta inválida." };

    const dateObj = parseDateOnly(input.date);
    const existing = await prisma.cashClosing.findUnique({
      where: { companyId_date: { companyId, date: dateObj } },
    });
    if (existing) return { error: "Já existe um fechamento cadastrado para esse dia. Edite o existente." };

    // Lido antes da transação: ler arquivos dentro dela seguraria a
    // conexão do banco à toa, e anexo recusado deve barrar o fechamento
    // antes de qualquer escrita.
    const anexos = await validarAnexos(input.anexos ?? []);

    // Nasce PENDENTE e não gera lançamento nenhum. O dia foi conferido,
    // mas quem decide que ele entra no resultado é o financeiro.
    await prisma.cashClosing.create({
      data: {
        date: dateObj,
        companyId,
        accountId: input.accountId,
        countedCash: input.countedCash,
        notes: input.notes || null,
        lines: {
          create: [
            ...input.sangrias.map((l, i) => ({ type: "SANGRIA" as const, label: l.label.trim(), amount: l.amount, order: i })),
            ...input.pagamentos.map((l, i) => ({ type: "PAGAMENTO" as const, label: l.label.trim(), amount: l.amount, order: i })),
          ],
        },
        documents: { create: anexos.map((a) => ({ ...a, company: { connect: { id: companyId } } })) },
      },
    });

    revalidateAll();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar o fechamento." };
  }
}

export async function updateCashClosing(id: string, input: CashClosingInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId("fechamento-caixa");

    const closing = await prisma.cashClosing.findFirst({ where: { id, companyId } });
    if (!closing) return { error: "Fechamento não encontrado." };

    // Aprovado é número que já entrou no resultado. Editar por baixo
    // deixaria a receita do Balanço diferente da soma das linhas que a
    // pessoa está vendo — e sem nada na tela dizendo por quê.
    if (closing.status === "APROVADO") {
      return { error: "Fechamento aprovado. Reabra antes de editar." };
    }

    const account = await prisma.account.findFirst({ where: { id: input.accountId, companyId } });
    if (!account) return { error: "Conta inválida." };

    const dateObj = parseDateOnly(input.date);
    const duplicate = await prisma.cashClosing.findUnique({
      where: { companyId_date: { companyId, date: dateObj } },
    });
    if (duplicate && duplicate.id !== id) {
      return { error: "Já existe outro fechamento cadastrado para esse dia." };
    }

    const anexos = await validarAnexos(input.anexos ?? []);

    await prisma.$transaction(async (tx) => {
      await tx.cashClosingLine.deleteMany({ where: { cashClosingId: id } });

      await tx.cashClosing.update({
        where: { id },
        data: {
          date: dateObj,
          accountId: input.accountId,
          countedCash: input.countedCash,
          notes: input.notes || null,
          lines: {
            create: [
              ...input.sangrias.map((l, i) => ({ type: "SANGRIA" as const, label: l.label.trim(), amount: l.amount, order: i })),
              ...input.pagamentos.map((l, i) => ({ type: "PAGAMENTO" as const, label: l.label.trim(), amount: l.amount, order: i })),
            ],
          },
        },
      });

      // As LINHAS são recriadas do zero (são a lista do dia inteiro), mas
      // os anexos só ACRESCENTAM: quem corrigiu um valor não pode perder a
      // nota que já estava ali.
      if (anexos.length > 0) {
        await tx.document.createMany({
          data: anexos.map((a) => ({ ...a, companyId, cashClosingId: id })),
        });
      }
    });

    revalidateAll();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar o fechamento." };
  }
}

/** Aprova o fechamento e o joga no razão.
 *
 * Gera DOIS lançamentos, não o líquido: a soma das sangrias como receita e
 * a soma dos pagamentos como despesa. O líquido daria o mesmo saldo e
 * mentiria no resultado — um dia com R$ 2.000 de sangria e R$ 300 de
 * pagamento apareceria como R$ 1.700 de receita e nenhuma despesa, e a
 * margem sairia melhor do que foi.
 *
 * Sem pagamento no dia, sai só a receita: lançamento de zero polui a lista
 * e não muda nada. */
export async function aprovarFechamento(id: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const companyId = await getActiveCompanyId("fechamento-caixa", "aprovar");
    const conta = await contaAtual();

    const closing = await prisma.cashClosing.findFirst({
      where: { id, companyId },
      include: { lines: true, account: { select: { name: true } } },
    });
    if (!closing) return { error: "Fechamento não encontrado." };
    if (closing.status === "APROVADO") return { error: "Este fechamento já foi aprovado." };

    const sangrias = somar(closing.lines.filter((l) => l.type === "SANGRIA").map((l) => ({ amount: Number(l.amount) })));
    const pagamentos = somar(closing.lines.filter((l) => l.type === "PAGAMENTO").map((l) => ({ amount: Number(l.amount) })));

    const [catReceita, catDespesa] = await Promise.all([
      categoria(companyId, CATEGORIA_SANGRIA, "INCOME"),
      pagamentos > 0 ? categoria(companyId, CATEGORIA_PAGAMENTO, "EXPENSE") : Promise.resolve(null),
    ]);

    const dia = dataBR(closing.date.toISOString().slice(0, 10));

    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          date: closing.date,
          amount: sangrias,
          type: "INCOME",
          description: `Sangrias do caixa — ${dia}`,
          companyId,
          accountId: closing.accountId,
          categoryId: catReceita.id,
          source: "MANUAL",
          cashClosingId: closing.id,
        },
      });

      if (pagamentos > 0 && catDespesa) {
        await tx.transaction.create({
          data: {
            date: closing.date,
            amount: pagamentos,
            type: "EXPENSE",
            description: `Pagamentos em dinheiro — ${dia}`,
            companyId,
            accountId: closing.accountId,
            categoryId: catDespesa.id,
            source: "MANUAL",
            cashClosingId: closing.id,
          },
        });
      }

      await tx.cashClosing.update({
        where: { id },
        data: {
          status: "APROVADO",
          approvedAt: new Date(),
          approvedByName: conta?.name ?? null,
          approvedById: conta?.id ?? null,
        },
      });
    });

    await auditar({
      companyId,
      module: "fechamento-caixa",
      acao: "aprovou",
      entidade: `Fechamento de ${formatDate(closing.date)}`,
      resumo: `${formatCurrency(sangrias)} de receita e ${formatCurrency(pagamentos)} de despesa entraram no resultado`,
      registroId: id,
    });

    revalidateAll();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível aprovar o fechamento." };
  }
}

/** Desfaz a aprovação e tira os lançamentos do razão.
 *
 * Existe porque corrigir um fechamento aprovado é caso real — o dia foi
 * digitado errado e alguém percebe depois. Sem reabrir, a saída seria
 * excluir e refazer, que perde os anexos e o histórico. */
export async function reabrirFechamento(id: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const companyId = await getActiveCompanyId("fechamento-caixa", "aprovar");

    const closing = await prisma.cashClosing.findFirst({ where: { id, companyId } });
    if (!closing) return { error: "Fechamento não encontrado." };
    if (closing.status === "PENDENTE") return { error: "Este fechamento ainda não foi aprovado." };

    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { cashClosingId: id, companyId } });
      await tx.cashClosing.update({
        where: { id },
        data: { status: "PENDENTE", approvedAt: null, approvedByName: null, approvedById: null },
      });
    });

    await auditar({
      companyId,
      module: "fechamento-caixa",
      acao: "reabriu",
      entidade: `Fechamento de ${formatDate(closing.date)}`,
      resumo: "os lançamentos saíram do resultado",
      registroId: id,
    });

    revalidateAll();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível reabrir o fechamento." };
  }
}

/** Remove um anexo do fechamento. O `companyId` no where impede que um id
 * de outra unidade apague anexo alheio. */
export async function removerAnexoFechamento(id: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const companyId = await getActiveCompanyId("fechamento-caixa");
    const { count } = await prisma.document.deleteMany({
      where: { id, companyId, cashClosingId: { not: null } },
    });
    if (count === 0) return { error: "Anexo não encontrado." };
    revalidateAll();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível remover o anexo." };
  }
}

export async function deleteCashClosing(id: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const companyId = await getActiveCompanyId("fechamento-caixa");

    const closing = await prisma.cashClosing.findFirst({ where: { id, companyId } });
    if (!closing) return { error: "Fechamento não encontrado." };
    if (closing.status === "APROVADO") {
      return { error: "Fechamento aprovado. Reabra antes de excluir." };
    }

    // As transações somem junto pelo CASCADE — mas um fechamento pendente
    // não tem nenhuma, então aqui é só o fechamento e suas linhas.
    await prisma.cashClosing.delete({ where: { id } });

    revalidateAll();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível excluir o fechamento." };
  }
}
