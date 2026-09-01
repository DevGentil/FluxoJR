"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auditar } from "@/lib/audit";
import { formatCurrency, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";
import { parseDateOnly } from "@/lib/date-only";

const NONE = "__none__";
const optionalSelect = z
  .string()
  .optional()
  .transform((v) => (v === NONE ? undefined : v));

const transactionSchema = z.object({
  date: z.string().min(1),
  amount: z.coerce.number().positive("O valor deve ser maior que zero"),
  type: z.enum(["INCOME", "EXPENSE"]),
  description: z.string().min(1, "Informe uma descrição"),
  accountId: z.string().min(1, "Selecione uma conta"),
  categoryId: z.string().optional(),
  supplierId: optionalSelect,
  transferCompanyId: optionalSelect,
});

export async function createTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(transactionSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("transacoes");
    const { categoryId, supplierId, transferCompanyId, ...data } = result.data;
    await prisma.transaction.create({
      data: {
        ...data,
        date: parseDateOnly(data.date),
        companyId,
        categoryId: categoryId || null,
        supplierId: supplierId || null,
        transferCompanyId: transferCompanyId || null,
        source: "MANUAL",
      },
    });

    revalidatePath("/transacoes");
    revalidatePath("/dashboard");
    revalidatePath("/relatorios");
    revalidatePath("/balanco");
  });
}

export async function updateTransaction(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = parseForm(transactionSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("transacoes");
    const { categoryId, supplierId, transferCompanyId, ...data } = result.data;
    const { count } = await prisma.transaction.updateMany({
      where: { id, companyId },
      data: {
        ...data,
        date: parseDateOnly(data.date),
        categoryId: categoryId || null,
        supplierId: supplierId || null,
        transferCompanyId: transferCompanyId || null,
      },
    });
    if (count === 0) throw new Error("Transação não encontrada.");

    revalidatePath("/transacoes");
    revalidatePath("/dashboard");
    revalidatePath("/relatorios");
    revalidatePath("/balanco");
  });
}

export async function deleteTransaction(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("transacoes");

    const alvo = await prisma.transaction.findFirst({ where: { id, companyId } });
    if (!alvo) throw new Error("Transação não encontrada.");

    const { count } = await prisma.transaction.deleteMany({
      where: { id, companyId },
    });
    if (count === 0) throw new Error("Transação não encontrada.");

    await auditar({
      companyId,
      module: "transacoes",
      acao: "excluiu",
      entidade: alvo.description,
      resumo: `${formatDate(alvo.date)} — ${alvo.type === "INCOME" ? "entrada" : "saída"} de ${formatCurrency(Number(alvo.amount))}`,
      registroId: id,
    });

    revalidatePath("/transacoes");
    revalidatePath("/dashboard");
  });
}

export async function deleteTransactions(ids: string[]): Promise<ActionState> {
  return runMutation(async () => {
    if (ids.length === 0) throw new Error("Nenhuma transação selecionada.");
    await requireUser();
    const companyId = await getActiveCompanyId("transacoes");

    const alvos = await prisma.transaction.findMany({ where: { id: { in: ids }, companyId } });
    if (alvos.length === 0) throw new Error("Nenhuma transação encontrada.");

    const { count } = await prisma.transaction.deleteMany({
      where: { id: { in: ids }, companyId },
    });
    if (count === 0) throw new Error("Nenhuma transação encontrada.");

    // Exclusão em lote vira UM registro com o total, não um por linha: o
    // que se quer saber é "sumiram R$ X em N transações naquele dia", e
    // cinquenta registros seguidos escondem isso em vez de mostrar.
    const total = alvos.reduce((s, t) => s + Number(t.amount) * (t.type === "INCOME" ? 1 : -1), 0);
    await auditar({
      companyId,
      module: "transacoes",
      acao: "excluiu",
      entidade: `${count} transações de uma vez`,
      resumo: `efeito líquido de ${formatCurrency(total)} desfeito`,
    });

    revalidatePath("/transacoes");
    revalidatePath("/dashboard");
  });
}

const importRowSchema = z.object({
  date: z.string().min(1),
  amount: z.number(),
  type: z.enum(["INCOME", "EXPENSE"]),
  description: z.string().min(1),
});

export async function importTransactions(input: {
  fileName: string;
  accountId: string;
  categoryId?: string;
  rows: { date: string; amount: number; type: "INCOME" | "EXPENSE"; description: string }[];
}) {
  await requireUser();

  const parsedRows = z.array(importRowSchema).parse(input.rows);
  if (parsedRows.length === 0) return { imported: 0 };

  const companyId = await getActiveCompanyId("transacoes");

  const account = await prisma.account.findFirst({
    where: { id: input.accountId, companyId },
    select: { id: true },
  });
  if (!account) throw new Error("Conta inválida.");

  await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        fileName: input.fileName,
        rowsImported: parsedRows.length,
        companyId,
      },
    });

    await tx.transaction.createMany({
      data: parsedRows.map((row) => ({
        date: parseDateOnly(row.date),
        amount: Math.abs(row.amount),
        type: row.type,
        description: row.description,
        companyId,
        accountId: input.accountId,
        categoryId: input.categoryId || null,
        importBatchId: batch.id,
        source: "IMPORT" as const,
      })),
    });
  });

  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  return { imported: parsedRows.length };
}
