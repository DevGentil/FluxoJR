"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date-only";
import { validarAnexos } from "@/lib/anexos";

const SANGRIA_CATEGORY_NAME = "Sangria Caixa";

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
   * fechamento nao pode ficar refem de ter o papel em maos. */
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

/** O que de fato entrou no caixa: sangrias menos os pagamentos em
 * dinheiro do dia.
 *
 * Antes só o total das sangrias virava transação, e os pagamentos ficavam
 * apenas como detalhe do fechamento. O efeito era a entrada aparecer
 * maior do que foi — dinheiro que saiu pela porta contava como receita no
 * Dashboard, nos Relatórios e no Balanço.
 *
 * As linhas individuais continuam só no fechamento: o razão principal
 * quer o líquido do dia, não quinze lançamentos de fornecedor. */
function valorDoCaixa(input: CashClosingInput) {
  const sangrias = input.sangrias.reduce((s, l) => s + l.amount, 0);
  const pagamentos = input.pagamentos.reduce((s, l) => s + l.amount, 0);
  return sangrias - pagamentos;
}

function descricaoDoCaixa(data: string) {
  return "Caixa do dia — " + data.split("-").reverse().join("/");
}

async function getOrCreateSangriaCategory(companyId: string) {
  const existing = await prisma.category.findFirst({
    where: { companyId, name: SANGRIA_CATEGORY_NAME, type: "INCOME" },
  });
  if (existing) return existing;
  return prisma.category.create({
    data: { companyId, name: SANGRIA_CATEGORY_NAME, type: "INCOME" },
  });
}

export async function createCashClosing(input: CashClosingInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId("fechamento-caixa");

    const account = await prisma.account.findFirst({ where: { id: input.accountId, companyId } });
    if (!account) return { error: "Conta inválida." };

    const existing = await prisma.cashClosing.findUnique({
      where: { companyId_date: { companyId, date: parseDateOnly(input.date) } },
    });
    if (existing) return { error: "Já existe um fechamento cadastrado para esse dia. Edite o existente." };

    const liquido = valorDoCaixa(input);
    const category = await getOrCreateSangriaCategory(companyId);
    const dateObj = parseDateOnly(input.date);

    // Lido antes da transacao: ler arquivos dentro dela seguraria a
    // conexao do banco a toa, e anexo recusado deve barrar o fechamento
    // antes de qualquer escrita.
    const anexos = await validarAnexos(input.anexos ?? []);

    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          date: dateObj,
          amount: liquido,
          type: "INCOME",
          description: descricaoDoCaixa(input.date),
          companyId,
          accountId: input.accountId,
          categoryId: category.id,
          source: "MANUAL",
        },
      });

      await tx.cashClosing.create({
        data: {
          date: dateObj,
          companyId,
          accountId: input.accountId,
          countedCash: input.countedCash,
          notes: input.notes || null,
          transactionId: transaction.id,
          lines: {
            create: [
              ...input.sangrias.map((l, i) => ({ type: "SANGRIA" as const, label: l.label.trim(), amount: l.amount, order: i })),
              ...input.pagamentos.map((l, i) => ({ type: "PAGAMENTO" as const, label: l.label.trim(), amount: l.amount, order: i })),
            ],
          },
          documents: { create: anexos.map((a) => ({ ...a, company: { connect: { id: companyId } } })) },
        },
      });
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

    const account = await prisma.account.findFirst({ where: { id: input.accountId, companyId } });
    if (!account) return { error: "Conta inválida." };

    const dateObj = parseDateOnly(input.date);
    const duplicate = await prisma.cashClosing.findUnique({
      where: { companyId_date: { companyId, date: dateObj } },
    });
    if (duplicate && duplicate.id !== id) {
      return { error: "Já existe outro fechamento cadastrado para esse dia." };
    }

    const liquido = valorDoCaixa(input);
    const category = await getOrCreateSangriaCategory(companyId);
    const description = descricaoDoCaixa(input.date);
    const anexos = await validarAnexos(input.anexos ?? []);

    await prisma.$transaction(async (tx) => {
      await tx.cashClosingLine.deleteMany({ where: { cashClosingId: id } });

      let transactionId = closing.transactionId;
      if (transactionId) {
        await tx.transaction.update({
          where: { id: transactionId },
          data: { date: dateObj, amount: liquido, accountId: input.accountId, categoryId: category.id, description },
        });
      } else {
        const transaction = await tx.transaction.create({
          data: {
            date: dateObj,
            amount: liquido,
            type: "INCOME",
            description,
            companyId,
            accountId: input.accountId,
            categoryId: category.id,
            source: "MANUAL",
          },
        });
        transactionId = transaction.id;
      }

      await tx.cashClosing.update({
        where: { id },
        data: {
          date: dateObj,
          accountId: input.accountId,
          countedCash: input.countedCash,
          notes: input.notes || null,
          transactionId,
          lines: {
            create: [
              ...input.sangrias.map((l, i) => ({ type: "SANGRIA" as const, label: l.label.trim(), amount: l.amount, order: i })),
              ...input.pagamentos.map((l, i) => ({ type: "PAGAMENTO" as const, label: l.label.trim(), amount: l.amount, order: i })),
            ],
          },
        },
      });

      // As LINHAS sao recriadas do zero (sao a lista do dia inteiro), mas
      // os anexos so ACRESCENTAM: quem corrigiu um valor nao pode perder a
      // nota que ja estava ali.
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

    await prisma.$transaction(async (tx) => {
      await tx.cashClosing.delete({ where: { id } });
      if (closing.transactionId) {
        await tx.transaction.delete({ where: { id: closing.transactionId } }).catch(() => {});
      }
    });

    revalidateAll();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível excluir o fechamento." };
  }
}
