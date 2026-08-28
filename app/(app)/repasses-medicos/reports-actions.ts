"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";

export interface PeriodLineInput {
  serviceItemId: string;
  quantity: number;
}

export interface PeriodReportInput {
  doctorId: string;
  competencia: string; // "YYYY-MM"
  notes?: string;
  /** O que o médico fez no mês: quantidade por item do contrato dele. */
  lines: PeriodLineInput[];
}

function validate(input: PeriodReportInput): string | null {
  if (!input.doctorId) return "Selecione o médico.";
  if (!/^\d{4}-\d{2}$/.test(input.competencia)) return "Informe o mês de referência.";
  if (input.lines.length === 0) return "Lance pelo menos um item.";

  for (const l of input.lines) {
    if (!l.serviceItemId) return "Selecione o item em todas as linhas.";
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
      return "Toda quantidade deve ser maior que zero.";
    }
  }
  const seen = new Set<string>();
  for (const l of input.lines) {
    if (seen.has(l.serviceItemId)) return "Não repita o mesmo item nas linhas.";
    seen.add(l.serviceItemId);
  }
  return null;
}

/** Congela a taxa contratada do médico em cada linha. O valor fica preso ao
 * lançamento: se o contrato mudar depois, o histórico não se mexe. */
async function buildLinesData(doctorId: string, lines: PeriodLineInput[]) {
  const rates = await prisma.doctorServiceRate.findMany({
    where: { doctorId, serviceItemId: { in: lines.map((l) => l.serviceItemId) } },
  });
  const rateByItem = new Map(rates.map((r) => [r.serviceItemId, Number(r.rate)]));

  return lines.map((l) => {
    const rate = rateByItem.get(l.serviceItemId);
    if (rate === undefined) {
      throw new Error("Esse médico não tem valor contratado para um dos itens selecionados.");
    }
    return { serviceItemId: l.serviceItemId, quantity: l.quantity, rate };
  });
}

export async function createPeriodReport(input: PeriodReportInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId();

    const doctor = await prisma.doctor.findFirst({ where: { id: input.doctorId, companyId } });
    if (!doctor) return { error: "Médico não encontrado." };

    const competenciaDate = new Date(`${input.competencia}-01T00:00:00`);
    const existing = await prisma.doctorPeriodReport.findUnique({
      where: { doctorId_competencia: { doctorId: input.doctorId, competencia: competenciaDate } },
    });
    if (existing) {
      return { error: "Já existe um repasse cadastrado para esse médico nesse mês. Edite o existente." };
    }

    const linesData = await buildLinesData(input.doctorId, input.lines);

    await prisma.doctorPeriodReport.create({
      data: {
        doctorId: input.doctorId,
        companyId,
        competencia: competenciaDate,
        notes: input.notes?.trim() || null,
        lines: { create: linesData },
      },
    });

    revalidatePath("/repasses-medicos");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar o repasse." };
  }
}

export async function updatePeriodReport(id: string, input: PeriodReportInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId();

    const report = await prisma.doctorPeriodReport.findFirst({ where: { id, companyId } });
    if (!report) return { error: "Repasse não encontrado." };

    const doctor = await prisma.doctor.findFirst({ where: { id: input.doctorId, companyId } });
    if (!doctor) return { error: "Médico não encontrado." };

    const competenciaDate = new Date(`${input.competencia}-01T00:00:00`);
    const duplicate = await prisma.doctorPeriodReport.findUnique({
      where: { doctorId_competencia: { doctorId: input.doctorId, competencia: competenciaDate } },
    });
    if (duplicate && duplicate.id !== id) {
      return { error: "Já existe outro repasse cadastrado para esse médico nesse mês." };
    }

    const linesData = await buildLinesData(input.doctorId, input.lines);

    await prisma.$transaction(async (tx) => {
      await tx.doctorPeriodLine.deleteMany({ where: { reportId: id } });
      await tx.doctorPeriodReport.update({
        where: { id },
        data: {
          doctorId: input.doctorId,
          competencia: competenciaDate,
          notes: input.notes?.trim() || null,
          lines: { create: linesData },
        },
      });
    });

    revalidatePath("/repasses-medicos");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar o repasse." };
  }
}

export async function deletePeriodReport(id: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.doctorPeriodReport.deleteMany({ where: { id, companyId } });
    if (count === 0) return { error: "Repasse não encontrado." };

    revalidatePath("/repasses-medicos");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível excluir o repasse." };
  }
}
