"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";

export interface DoctorExamRateInput {
  examTypeId: string;
  rate: number;
}

export interface DoctorInput {
  name: string;
  document?: string;
  paymentMethod?: string;
  consultationRate: number;
  active: boolean;
  notes?: string;
  examRates: DoctorExamRateInput[];
}

function validate(input: DoctorInput): string | null {
  if (!input.name.trim()) return "Informe o nome do médico.";
  if (!Number.isFinite(input.consultationRate) || input.consultationRate < 0) {
    return "Informe um valor de consulta válido.";
  }
  for (const r of input.examRates) {
    if (!r.examTypeId) return "Selecione o tipo de exame em todas as linhas.";
    if (!Number.isFinite(r.rate) || r.rate < 0) return "Todo valor de exame deve ser válido.";
  }
  const seen = new Set<string>();
  for (const r of input.examRates) {
    if (seen.has(r.examTypeId)) return "Não repita o mesmo tipo de exame nas taxas do médico.";
    seen.add(r.examTypeId);
  }
  return null;
}

export async function createDoctor(input: DoctorInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId();

    await prisma.doctor.create({
      data: {
        companyId,
        name: input.name.trim(),
        document: input.document?.trim() || null,
        paymentMethod: input.paymentMethod?.trim() || null,
        consultationRate: input.consultationRate,
        active: input.active,
        notes: input.notes?.trim() || null,
        examRates: {
          create: input.examRates.map((r) => ({ examTypeId: r.examTypeId, rate: r.rate })),
        },
      },
    });

    revalidatePath("/repasses-medicos");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar o médico." };
  }
}

export async function updateDoctor(id: string, input: DoctorInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId();

    const doctor = await prisma.doctor.findFirst({ where: { id, companyId } });
    if (!doctor) return { error: "Médico não encontrado." };

    await prisma.$transaction(async (tx) => {
      await tx.doctorExamRate.deleteMany({ where: { doctorId: id } });
      await tx.doctor.update({
        where: { id },
        data: {
          name: input.name.trim(),
          document: input.document?.trim() || null,
          paymentMethod: input.paymentMethod?.trim() || null,
          consultationRate: input.consultationRate,
          active: input.active,
          notes: input.notes?.trim() || null,
          examRates: {
            create: input.examRates.map((r) => ({ examTypeId: r.examTypeId, rate: r.rate })),
          },
        },
      });
    });

    revalidatePath("/repasses-medicos");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar o médico." };
  }
}

export async function deleteDoctor(id: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.doctor.deleteMany({ where: { id, companyId } });
    if (count === 0) return { error: "Médico não encontrado." };

    revalidatePath("/repasses-medicos");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível excluir o médico." };
  }
}
