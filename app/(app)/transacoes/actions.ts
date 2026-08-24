"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompany } from "@/lib/company";

const transactionSchema = z.object({
  date: z.string().min(1),
  amount: z.coerce.number().positive("O valor deve ser maior que zero"),
  type: z.enum(["INCOME", "EXPENSE"]),
  description: z.string().min(1, "Informe uma descrição"),
  accountId: z.string().min(1, "Selecione uma conta"),
  categoryId: z.string().optional(),
});

export type ActionState = { error?: string } | undefined;

export async function createTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData);
  const parsed = transactionSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const company = await getDefaultCompany();
  const { categoryId, ...data } = parsed.data;
  await prisma.transaction.create({
    data: {
      ...data,
      date: new Date(data.date),
      companyId: company.id,
      categoryId: categoryId || null,
      source: "MANUAL",
    },
  });

  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  return undefined;
}

export async function updateTransaction(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const raw = Object.fromEntries(formData);
  const parsed = transactionSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { categoryId, ...data } = parsed.data;
  await prisma.transaction.update({
    where: { id },
    data: { ...data, date: new Date(data.date), categoryId: categoryId || null },
  });

  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  return undefined;
}

export async function deleteTransaction(id: string) {
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
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
  const parsedRows = z.array(importRowSchema).parse(input.rows);
  if (parsedRows.length === 0) return { imported: 0 };

  const company = await getDefaultCompany();

  await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        fileName: input.fileName,
        rowsImported: parsedRows.length,
        companyId: company.id,
      },
    });

    await tx.transaction.createMany({
      data: parsedRows.map((row) => ({
        date: new Date(row.date),
        amount: Math.abs(row.amount),
        type: row.type,
        description: row.description,
        companyId: company.id,
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
