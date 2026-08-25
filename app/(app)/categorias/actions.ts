"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

const categorySchema = z.object({
  name: z.string().min(1, "Informe o nome da categoria"),
  type: z.enum(["INCOME", "EXPENSE"]),
  costCenter: z.string().optional(),
});

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(categorySchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    await prisma.category.create({ data: { ...result.data, companyId } });

    revalidatePath("/categorias");
  });
}

export async function updateCategory(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = parseForm(categorySchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.category.updateMany({
      where: { id, companyId },
      data: result.data,
    });
    if (count === 0) throw new Error("Categoria não encontrada.");

    revalidatePath("/categorias");
  });
}

export async function deleteCategory(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.category.deleteMany({
      where: { id, companyId },
    });
    if (count === 0) throw new Error("Categoria não encontrada.");

    revalidatePath("/categorias");
  });
}
