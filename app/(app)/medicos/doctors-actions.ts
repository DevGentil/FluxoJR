"use server";

import { revalidateRepassesModule } from "@/lib/revalidate-repasses";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";

export interface DoctorServiceRateInput {
  serviceItemId: string;
  rate: number;
}

export interface DoctorInput {
  name: string;
  specialty: string;
  document?: string;
  paymentMethod?: string;
  active: boolean;
  notes?: string;
  /** O contrato inteiro: um valor por item que o médico recebe. Ele pode
   * combinar consulta, exame, procedimento e plantão livremente — não há
   * mais "modelo de pagamento" exclusivo. */
  serviceRates: DoctorServiceRateInput[];
}

function validate(input: DoctorInput): string | null {
  if (!input.name.trim()) return "Informe o nome do médico.";
  if (!input.specialty.trim()) return "Informe a especialização do médico.";

  for (const r of input.serviceRates) {
    if (!r.serviceItemId) return "Selecione o item em todas as linhas do contrato.";
    if (!Number.isFinite(r.rate) || r.rate < 0) return "Todo valor de repasse deve ser válido.";
  }
  const seen = new Set<string>();
  for (const r of input.serviceRates) {
    if (seen.has(r.serviceItemId)) return "Não repita o mesmo item no contrato do médico.";
    seen.add(r.serviceItemId);
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
        specialty: input.specialty.trim(),
        document: input.document?.trim() || null,
        paymentMethod: input.paymentMethod?.trim() || null,
        active: input.active,
        notes: input.notes?.trim() || null,
        serviceRates: {
          create: input.serviceRates.map((r) => ({
            serviceItemId: r.serviceItemId,
            rate: r.rate,
            lastCheckedAt: new Date(),
          })),
        },
      },
    });

    revalidateRepassesModule();
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

    // Só reinicia o relógio da "última conferência" do valor que realmente
    // mudou — senão salvar o médico marcaria o contrato inteiro como
    // conferido hoje, que é justamente o vício da planilha (a coluna
    // existia e nunca dizia nada).
    const previous = await prisma.doctorServiceRate.findMany({ where: { doctorId: id } });
    const previousByItem = new Map(previous.map((r) => [r.serviceItemId, r]));

    await prisma.$transaction(async (tx) => {
      await tx.doctorServiceRate.deleteMany({ where: { doctorId: id } });
      await tx.doctor.update({
        where: { id },
        data: {
          name: input.name.trim(),
          specialty: input.specialty.trim(),
          document: input.document?.trim() || null,
          paymentMethod: input.paymentMethod?.trim() || null,
          active: input.active,
          notes: input.notes?.trim() || null,
          serviceRates: {
            create: input.serviceRates.map((r) => {
              const prev = previousByItem.get(r.serviceItemId);
              const unchanged = prev != null && Number(prev.rate) === r.rate;
              return {
                serviceItemId: r.serviceItemId,
                rate: r.rate,
                lastCheckedAt: unchanged ? prev.lastCheckedAt : new Date(),
              };
            }),
          },
        },
      });
    });

    revalidateRepassesModule();
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

    revalidateRepassesModule();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível excluir o médico." };
  }
}

/** Marca o contrato inteiro do médico como conferido hoje, sem alterar
 * valor nenhum. É o "conferi e continua certo" — a razão de existir da
 * coluna "Última conferência" que a planilha criou e nunca preencheu,
 * porque lá não havia como registrar isso sem editar a linha. */
export async function markContractChecked(doctorId: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const companyId = await getActiveCompanyId();

    const doctor = await prisma.doctor.findFirst({ where: { id: doctorId, companyId } });
    if (!doctor) return { error: "Médico não encontrado." };

    await prisma.doctorServiceRate.updateMany({
      where: { doctorId },
      data: { lastCheckedAt: new Date() },
    });

    revalidateRepassesModule();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível registrar a conferência." };
  }
}
