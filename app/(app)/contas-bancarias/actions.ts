"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

const accountSchema = z.object({
  name: z.string().min(1, "Informe o nome da conta"),
  bank: z.string().optional(),
  type: z.string().min(1),
  initialBalance: z.coerce.number(),
});

export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(accountSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    await prisma.account.create({
      data: { ...result.data, companyId },
    });

    revalidatePath("/contas-bancarias");
    revalidatePath("/dashboard");
  });
}

export async function updateAccount(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = parseForm(accountSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.account.updateMany({
      where: { id, companyId },
      data: result.data,
    });
    if (count === 0) throw new Error("Conta não encontrada.");

    revalidatePath("/contas-bancarias");
    revalidatePath("/dashboard");
  });
}

export async function deleteAccount(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.account.deleteMany({
      where: { id, companyId },
    });
    if (count === 0) throw new Error("Conta não encontrada.");

    revalidatePath("/contas-bancarias");
    revalidatePath("/dashboard");
  });
}
