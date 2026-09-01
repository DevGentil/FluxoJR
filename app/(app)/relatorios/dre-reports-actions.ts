"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { startOfMonth } from "@/lib/date-only";
import { runMutation, type ActionState } from "@/lib/actions-utils";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function uploadDreReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get("file");
  const competencia = formData.get("competencia");
  const notes = formData.get("notes");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { error: "Arquivo muito grande. O limite é 10MB." };
  }
  if (typeof competencia !== "string" || !/^\d{4}-\d{2}$/.test(competencia)) {
    return { error: "Informe o mês de referência." };
  }

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("relatorios");

    const existing = await prisma.dreReport.findUnique({
      where: { companyId_competencia: { companyId, competencia: startOfMonth(competencia) } },
    });
    if (existing) {
      throw new Error("Já existe um DRE realizado cadastrado para esse mês. Exclua o existente para substituir.");
    }

    const content = Buffer.from(await file.arrayBuffer());

    await prisma.dreReport.create({
      data: {
        companyId,
        competencia: startOfMonth(competencia),
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
        content,
      },
    });

    revalidatePath("/relatorios");
  });
}

export async function deleteDreReport(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("relatorios");
    const { count } = await prisma.dreReport.deleteMany({ where: { id, companyId } });
    if (count === 0) throw new Error("DRE realizado não encontrado.");
    revalidatePath("/relatorios");
  });
}
