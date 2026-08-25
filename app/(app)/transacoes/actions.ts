"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

const transactionSchema = z.object({
  date: z.string().min(1),
  amount: z.coerce.number().positive("O valor deve ser maior que zero"),
  type: z.enum(["INCOME", "EXPENSE"]),
  description: z.string().min(1, "Informe uma descrição"),
  accountId: z.string().min(1, "Selecione uma conta"),
  categoryId: z.string().optional(),
});

export async function createTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(transactionSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { categoryId, ...data } = result.data;
    await prisma.transaction.create({
      data: {
        ...data,
        date: new Date(data.date),
        companyId,
        categoryId: categoryId || null,
        source: "MANUAL",
      },
    });

    revalidatePath("/transacoes");
    revalidatePath("/dashboard");
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
    const companyId = await getActiveCompanyId();
    const { categoryId, ...data } = result.data;
    const { count } = await prisma.transaction.updateMany({
      where: { id, companyId },
      data: { ...data, date: new Date(data.date), categoryId: categoryId || null },
    });
    if (count === 0) throw new Error("Transação não encontrada.");

    revalidatePath("/transacoes");
    revalidatePath("/dashboard");
  });
}

export async function deleteTransaction(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.transaction.deleteMany({
      where: { id, companyId },
    });
    if (count === 0) throw new Error("Transação não encontrada.");

    revalidatePath("/transacoes");
    revalidatePath("/dashboard");
  });
}

export async function deleteTransactions(ids: string[]): Promise<ActionState> {
  return runMutation(async () => {
    if (ids.length === 0) throw new Error("Nenhuma transação selecionada.");
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.transaction.deleteMany({
      where: { id: { in: ids }, companyId },
    });
    if (count === 0) throw new Error("Nenhuma transação encontrada.");

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

  const companyId = await getActiveCompanyId();

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
        date: new Date(row.date),
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
