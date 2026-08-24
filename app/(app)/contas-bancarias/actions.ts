"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompany } from "@/lib/company";

const accountSchema = z.object({
  name: z.string().min(1, "Informe o nome da conta"),
  bank: z.string().optional(),
  type: z.string().min(1),
  initialBalance: z.coerce.number(),
});

export type ActionState = { error?: string } | undefined;

export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const company = await getDefaultCompany();
  await prisma.account.create({
    data: { ...parsed.data, companyId: company.id },
  });

  revalidatePath("/contas-bancarias");
  revalidatePath("/dashboard");
  return undefined;
}

export async function updateAccount(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  await prisma.account.update({ where: { id }, data: parsed.data });

  revalidatePath("/contas-bancarias");
  revalidatePath("/dashboard");
  return undefined;
}

export async function deleteAccount(id: string) {
  await prisma.account.delete({ where: { id } });
  revalidatePath("/contas-bancarias");
  revalidatePath("/dashboard");
}
