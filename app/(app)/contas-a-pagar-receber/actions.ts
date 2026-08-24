"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompany } from "@/lib/company";
import { requireUser } from "@/lib/auth";
import { runMutation, type ActionState } from "@/lib/actions-utils";

const scheduledSchema = z.object({
  type: z.enum(["PAYABLE", "RECEIVABLE"]),
  description: z.string().min(1, "Informe uma descrição"),
  amount: z.coerce.number().positive("O valor deve ser maior que zero"),
  dueDate: z.string().min(1),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
});

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

  return runMutation(async () => {
    await requireUser();
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
  });
}

export async function updateScheduledEntry(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = scheduledSchema.safeParse(stripNone(Object.fromEntries(formData)));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  return runMutation(async () => {
    await requireUser();
    const company = await getDefaultCompany();
    const { accountId, categoryId, dueDate, ...rest } = parsed.data;
    const { count } = await prisma.scheduledEntry.updateMany({
      where: { id, companyId: company.id },
      data: {
        ...rest,
        dueDate: new Date(dueDate),
        accountId: accountId || null,
        categoryId: categoryId || null,
      },
    });
    if (count === 0) throw new Error("Lançamento não encontrado.");

    revalidatePath("/contas-a-pagar-receber");
    revalidatePath("/dashboard");
  });
}

export async function deleteScheduledEntry(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const company = await getDefaultCompany();
    const { count } = await prisma.scheduledEntry.deleteMany({
      where: { id, companyId: company.id },
    });
    if (count === 0) throw new Error("Lançamento não encontrado.");

    revalidatePath("/contas-a-pagar-receber");
    revalidatePath("/dashboard");
  });
}

export async function markAsPaid(id: string, accountId: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const company = await getDefaultCompany();

    const [entry, account] = await Promise.all([
      prisma.scheduledEntry.findFirst({ where: { id, companyId: company.id } }),
      prisma.account.findFirst({ where: { id: accountId, companyId: company.id }, select: { id: true } }),
    ]);
    if (!entry) throw new Error("Lançamento não encontrado.");
    if (!account) throw new Error("Conta inválida.");
    if (entry.status === "PAID") throw new Error("Este lançamento já foi baixado.");

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
  });
}
