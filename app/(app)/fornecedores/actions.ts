"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

const supplierSchema = z.object({
  name: z.string().min(1, "Informe o nome do fornecedor"),
  document: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

function normalize(data: z.infer<typeof supplierSchema>) {
  return {
    name: data.name,
    document: data.document || null,
    phone: data.phone || null,
    email: data.email || null,
  };
}

export async function createSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(supplierSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    await prisma.supplier.create({ data: { ...normalize(result.data), companyId } });

    revalidatePath("/fornecedores");
  });
}

export async function updateSupplier(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = parseForm(supplierSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.supplier.updateMany({
      where: { id, companyId },
      data: normalize(result.data),
    });
    if (count === 0) throw new Error("Fornecedor não encontrado.");

    revalidatePath("/fornecedores");
  });
}

export async function deleteSupplier(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.supplier.deleteMany({
      where: { id, companyId },
    });
    if (count === 0) throw new Error("Fornecedor não encontrado.");

    revalidatePath("/fornecedores");
  });
}
