"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

const serviceItemSchema = z.object({
  name: z.string().min(1, "Informe o nome do tipo de exame"),
});

export async function createServiceItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(serviceItemSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    await prisma.serviceItem.create({ data: { ...result.data, companyId } });

    revalidatePath("/repasses-medicos");
  });
}

export async function updateServiceItem(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = parseForm(serviceItemSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.serviceItem.updateMany({
      where: { id, companyId },
      data: result.data,
    });
    if (count === 0) throw new Error("Tipo de exame não encontrado.");

    revalidatePath("/repasses-medicos");
  });
}

export async function deleteServiceItem(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const existing = await prisma.serviceItem.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error("Tipo de exame não encontrado.");

    try {
      await prisma.serviceItem.delete({ where: { id } });
    } catch {
      throw new Error(
        "Esse tipo de exame já tem repasses lançados. Não é possível excluir — só arquive o médico ou pare de usá-lo."
      );
    }

    revalidatePath("/repasses-medicos");
  });
}
