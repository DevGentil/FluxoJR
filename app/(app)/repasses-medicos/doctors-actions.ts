"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";

export type DoctorPaymentModel = "CONSULTATION" | "CONSULTATION_AND_EXAM" | "HOURLY";

export interface DoctorServiceRateInput {
  serviceItemId: string;
  rate: number;
}

export interface DoctorInput {
  name: string;
  specialty: string;
  document?: string;
  paymentMethod?: string;
  paymentModel: DoctorPaymentModel;
  consultationRate?: number;
  hourlyRate?: number;
  active: boolean;
  notes?: string;
  serviceRates: DoctorServiceRateInput[];
}

function validate(input: DoctorInput): string | null {
  if (!input.name.trim()) return "Informe o nome do médico.";
  if (!input.specialty.trim()) return "Informe a especialização do médico.";

  if (input.paymentModel === "HOURLY") {
    if (!Number.isFinite(input.hourlyRate) || (input.hourlyRate as number) < 0) {
      return "Informe um valor por hora válido.";
    }
    return null;
  }

  if (!Number.isFinite(input.consultationRate) || (input.consultationRate as number) < 0) {
    return "Informe um valor de consulta válido.";
  }
  if (input.paymentModel === "CONSULTATION_AND_EXAM") {
    for (const r of input.serviceRates) {
      if (!r.serviceItemId) return "Selecione o tipo de exame em todas as linhas.";
      if (!Number.isFinite(r.rate) || r.rate < 0) return "Todo valor de exame deve ser válido.";
    }
    const seen = new Set<string>();
    for (const r of input.serviceRates) {
      if (seen.has(r.serviceItemId)) return "Não repita o mesmo tipo de exame nas taxas do médico.";
      seen.add(r.serviceItemId);
    }
  }
  return null;
}

// Normaliza os campos pro modelo de pagamento escolhido — evita gravar
// lixo (ex: hourlyRate preenchido num médico CONSULTATION) se o form
// mandar valores antigos de quando o usuário trocou de modelo na tela.
function normalize(input: DoctorInput) {
  const serviceRates = input.paymentModel === "CONSULTATION_AND_EXAM" ? input.serviceRates : [];
  return {
    consultationRate: input.paymentModel === "HOURLY" ? null : input.consultationRate ?? null,
    hourlyRate: input.paymentModel === "HOURLY" ? input.hourlyRate ?? null : null,
    serviceRates,
  };
}

export async function createDoctor(input: DoctorInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { consultationRate, hourlyRate, serviceRates } = normalize(input);

    await prisma.doctor.create({
      data: {
        companyId,
        name: input.name.trim(),
        specialty: input.specialty.trim(),
        document: input.document?.trim() || null,
        paymentMethod: input.paymentMethod?.trim() || null,
        paymentModel: input.paymentModel,
        consultationRate,
        hourlyRate,
        active: input.active,
        notes: input.notes?.trim() || null,
        serviceRates: {
          create: serviceRates.map((r) => ({ serviceItemId: r.serviceItemId, rate: r.rate })),
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
    const { consultationRate, hourlyRate, serviceRates } = normalize(input);

    await prisma.$transaction(async (tx) => {
      await tx.doctorServiceRate.deleteMany({ where: { doctorId: id } });
      await tx.doctor.update({
        where: { id },
        data: {
          name: input.name.trim(),
          specialty: input.specialty.trim(),
          document: input.document?.trim() || null,
          paymentMethod: input.paymentMethod?.trim() || null,
          paymentModel: input.paymentModel,
          consultationRate,
          hourlyRate,
          active: input.active,
          notes: input.notes?.trim() || null,
          serviceRates: {
            create: serviceRates.map((r) => ({ serviceItemId: r.serviceItemId, rate: r.rate })),
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
