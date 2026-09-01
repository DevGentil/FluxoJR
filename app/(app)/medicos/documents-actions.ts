"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { runMutation, type ActionState } from "@/lib/actions-utils";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Anexa um arquivo à ficha do médico — o contrato assinado, um aditivo, o
 * diploma. Mesmo armazenamento dos documentos da empresa (o conteúdo vai
 * direto no Postgres), só que amarrado ao médico. */
export async function uploadDoctorDocument(
  doctorId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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
    const companyId = await getActiveCompanyId("medicos");

    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, companyId },
      select: { id: true },
    });
    if (!doctor) throw new Error("Médico não encontrado.");

    await prisma.document.create({
      data: {
        companyId,
        doctorId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        description: description.trim(),
        content: Buffer.from(await file.arrayBuffer()),
      },
    });

    revalidatePath(`/medicos/${doctorId}`);
  });
}

export async function deleteDoctorDocument(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("medicos");

    const doc = await prisma.document.findFirst({
      where: { id, companyId, doctorId: { not: null } },
      select: { doctorId: true },
    });
    if (!doc) throw new Error("Documento não encontrado.");

    await prisma.document.delete({ where: { id } });
    revalidatePath(`/medicos/${doc.doctorId}`);
  });
}
