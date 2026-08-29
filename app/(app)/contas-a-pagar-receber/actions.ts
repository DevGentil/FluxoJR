"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseDateOnly, todayDateOnly } from "@/lib/date-only";
import { runMutation, type ActionState } from "@/lib/actions-utils";

const scheduledSchema = z.object({
  type: z.enum(["PAYABLE", "RECEIVABLE"]),
  description: z.string().min(1, "Informe uma descrição"),
  amount: z.coerce.number().positive("O valor deve ser maior que zero"),
  dueDate: z.string().min(1),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
});

function stripNone(raw: Record<string, FormDataEntryValue>) {
  const clean = { ...raw };
  for (const key of ["accountId", "categoryId", "supplierId"]) {
    if (clean[key] === "__none__") clean[key] = "";
  }
  return clean;
}

export async function createScheduledEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scheduledSchema.safeParse(stripNone(Object.fromEntries(formData)));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { accountId, categoryId, supplierId, dueDate, ...rest } = parsed.data;
    await prisma.scheduledEntry.create({
      data: {
        ...rest,
        dueDate: parseDateOnly(dueDate),
        companyId,
        accountId: accountId || null,
        categoryId: categoryId || null,
        supplierId: supplierId || null,
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
    const companyId = await getActiveCompanyId();
    const { accountId, categoryId, supplierId, dueDate, ...rest } = parsed.data;
    const { count } = await prisma.scheduledEntry.updateMany({
      where: { id, companyId },
      data: {
        ...rest,
        dueDate: parseDateOnly(dueDate),
        accountId: accountId || null,
        categoryId: categoryId || null,
        supplierId: supplierId || null,
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
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.scheduledEntry.deleteMany({
      where: { id, companyId },
    });
    if (count === 0) throw new Error("Lançamento não encontrado.");

    revalidatePath("/contas-a-pagar-receber");
    revalidatePath("/dashboard");
  });
}

const importRowSchema = z.object({
  dueDate: z.string().min(1),
  amount: z.number(),
  type: z.enum(["PAYABLE", "RECEIVABLE"]),
  description: z.string().min(1),
});

export async function importScheduledEntries(input: {
  fileName: string;
  accountId?: string;
  categoryId?: string;
  supplierId?: string;
  rows: { dueDate: string; amount: number; type: "PAYABLE" | "RECEIVABLE"; description: string }[];
}) {
  await requireUser();

  const parsedRows = z.array(importRowSchema).parse(input.rows);
  if (parsedRows.length === 0) return { imported: 0 };

  const companyId = await getActiveCompanyId();

  if (input.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: input.accountId, companyId },
      select: { id: true },
    });
    if (!account) throw new Error("Conta inválida.");
  }

  await prisma.scheduledEntry.createMany({
    data: parsedRows.map((row) => ({
      type: row.type,
      description: row.description,
      amount: Math.abs(row.amount),
      dueDate: parseDateOnly(row.dueDate),
      companyId,
      accountId: input.accountId || null,
      categoryId: input.categoryId || null,
      supplierId: input.supplierId || null,
      status: "PENDING" as const,
    })),
  });

  revalidatePath("/contas-a-pagar-receber");
  revalidatePath("/dashboard");
  return { imported: parsedRows.length };
}

export async function markAsPaid(id: string, accountId: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();

    const [entry, account] = await Promise.all([
      prisma.scheduledEntry.findFirst({ where: { id, companyId } }),
      prisma.account.findFirst({ where: { id: accountId, companyId }, select: { id: true } }),
    ]);
    if (!entry) throw new Error("Lançamento não encontrado.");
    if (!account) throw new Error("Conta inválida.");
    if (entry.status === "PAID") throw new Error("Este lançamento já foi baixado.");

    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          date: parseDateOnly(todayDateOnly()),
          amount: entry.amount,
          type: entry.type === "RECEIVABLE" ? "INCOME" : "EXPENSE",
          description: entry.description,
          companyId,
          accountId,
          categoryId: entry.categoryId,
          supplierId: entry.supplierId,
          source: "SCHEDULED",
        },
      });

      await tx.scheduledEntry.update({
        where: { id },
        data: {
          status: "PAID",
          paidDate: parseDateOnly(todayDateOnly()),
          transactionId: transaction.id,
          accountId,
        },
      });
    });

    revalidatePath("/contas-a-pagar-receber");
    revalidatePath("/transacoes");
    revalidatePath("/dashboard");
  });
}
