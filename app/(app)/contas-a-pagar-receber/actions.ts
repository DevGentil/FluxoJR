"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompany } from "@/lib/company";

const scheduledSchema = z.object({
  type: z.enum(["PAYABLE", "RECEIVABLE"]),
  description: z.string().min(1, "Informe uma descrição"),
  amount: z.coerce.number().positive("O valor deve ser maior que zero"),
  dueDate: z.string().min(1),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
});

export type ActionState = { error?: string } | undefined;

function stripNone(raw: Record<string, FormDataEntryValue>) {
  const clean = { ...raw };
  for (const key of ["accountId", "categoryId"]) {
    if (clean[key] === "__none__") clean[key] = "";
  }
  return clean;
}

export async function createScheduledEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scheduledSchema.safeParse(stripNone(Object.fromEntries(formData)));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const company = await getDefaultCompany();
  const { accountId, categoryId, dueDate, ...rest } = parsed.data;
  await prisma.scheduledEntry.create({
    data: {
      ...rest,
      dueDate: new Date(dueDate),
      companyId: company.id,
      accountId: accountId || null,
      categoryId: categoryId || null,
    },
  });

  revalidatePath("/contas-a-pagar-receber");
  revalidatePath("/dashboard");
  return undefined;
}

export async function updateScheduledEntry(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = scheduledSchema.safeParse(stripNone(Object.fromEntries(formData)));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { accountId, categoryId, dueDate, ...rest } = parsed.data;
  await prisma.scheduledEntry.update({
    where: { id },
    data: {
      ...rest,
      dueDate: new Date(dueDate),
      accountId: accountId || null,
      categoryId: categoryId || null,
    },
  });

  revalidatePath("/contas-a-pagar-receber");
  revalidatePath("/dashboard");
  return undefined;
}

export async function deleteScheduledEntry(id: string) {
  await prisma.scheduledEntry.delete({ where: { id } });
  revalidatePath("/contas-a-pagar-receber");
  revalidatePath("/dashboard");
}

export async function markAsPaid(id: string, accountId: string) {
  const entry = await prisma.scheduledEntry.findUniqueOrThrow({ where: { id } });
  const company = await getDefaultCompany();

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        date: new Date(),
        amount: entry.amount,
        type: entry.type === "RECEIVABLE" ? "INCOME" : "EXPENSE",
        description: entry.description,
        companyId: company.id,
        accountId,
        categoryId: entry.categoryId,
        source: "SCHEDULED",
      },
    });

    await tx.scheduledEntry.update({
      where: { id },
      data: { status: "PAID", paidDate: new Date(), transactionId: transaction.id, accountId },
    });
  });

  revalidatePath("/contas-a-pagar-receber");
  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
}
