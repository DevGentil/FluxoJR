"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { runMutation, type ActionState } from "@/lib/actions-utils";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function uploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get("file");
  const description = formData.get("description");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { error: "Arquivo muito grande. O limite é 10MB." };
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    return { error: "Descreva o que é esse arquivo." };
  }

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("empresas");
    const content = Buffer.from(await file.arrayBuffer());

    await prisma.document.create({
      data: {
        companyId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        description: description.trim(),
        content,
      },
    });

    revalidatePath("/empresas");
  });
}

export async function deleteDocument(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("empresas");
    const { count } = await prisma.document.deleteMany({ where: { id, companyId } });
    if (count === 0) throw new Error("Documento não encontrado.");
    revalidatePath("/empresas");
  });
}
