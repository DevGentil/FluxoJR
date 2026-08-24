"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompany } from "@/lib/company";

const categorySchema = z.object({
  name: z.string().min(1, "Informe o nome da categoria"),
  type: z.enum(["INCOME", "EXPENSE"]),
  costCenter: z.string().optional(),
});

export type ActionState = { error?: string } | undefined;

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const company = await getDefaultCompany();
  await prisma.category.create({ data: { ...parsed.data, companyId: company.id } });

  revalidatePath("/categorias");
  return undefined;
}

export async function updateCategory(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  await prisma.category.update({ where: { id }, data: parsed.data });
  revalidatePath("/categorias");
  return undefined;
}

export async function deleteCategory(id: string) {
  await prisma.category.delete({ where: { id } });
  revalidatePath("/categorias");
}
