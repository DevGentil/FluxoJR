"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";

export interface PeriodExamCountInput {
  examTypeId: string;
  count: number;
}

export interface PeriodReportInput {
  doctorId: string;
  competencia: string; // "YYYY-MM"
  consultationCount: number;
  notes?: string;
  examCounts: PeriodExamCountInput[];
}

function validate(input: PeriodReportInput): string | null {
  if (!input.doctorId) return "Selecione o médico.";
  if (!/^\d{4}-\d{2}$/.test(input.competencia)) return "Informe o mês de referência.";
  if (!Number.isInteger(input.consultationCount) || input.consultationCount < 0) {
    return "Informe uma quantidade de consultas válida.";
  }
  for (const e of input.examCounts) {
    if (!e.examTypeId) return "Selecione o tipo de exame em todas as linhas.";
    if (!Number.isInteger(e.count) || e.count <= 0) return "Toda quantidade de exame deve ser maior que zero.";
  }
  const seen = new Set<string>();
  for (const e of input.examCounts) {
    if (seen.has(e.examTypeId)) return "Não repita o mesmo tipo de exame nas linhas.";
    seen.add(e.examTypeId);
  }
  return null;
}

async function buildExamCountsData(companyId: string, doctorId: string, examCounts: PeriodExamCountInput[]) {
  const rates = await prisma.doctorExamRate.findMany({
    where: { doctorId, examTypeId: { in: examCounts.map((e) => e.examTypeId) } },
  });
  const rateByExamType = new Map(rates.map((r) => [r.examTypeId, Number(r.rate)]));

  return examCounts.map((e) => {
    const rate = rateByExamType.get(e.examTypeId);
    if (rate === undefined) {
      throw new Error("Esse médico não tem taxa cadastrada para um dos tipos de exame selecionados.");
    }
    return { examTypeId: e.examTypeId, count: e.count, rate };
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

    const examCountsData = await buildExamCountsData(companyId, input.doctorId, input.examCounts);

    await prisma.doctorPeriodReport.create({
      data: {
        doctorId: input.doctorId,
        companyId,
        competencia: competenciaDate,
        consultationCount: input.consultationCount,
        consultationRate: doctor.consultationRate,
        notes: input.notes?.trim() || null,
        examCounts: { create: examCountsData },
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

    const examCountsData = await buildExamCountsData(companyId, input.doctorId, input.examCounts);

    await prisma.$transaction(async (tx) => {
      await tx.doctorPeriodExamCount.deleteMany({ where: { reportId: id } });
      await tx.doctorPeriodReport.update({
        where: { id },
        data: {
          doctorId: input.doctorId,
          competencia: competenciaDate,
          consultationCount: input.consultationCount,
          consultationRate: doctor.consultationRate,
          notes: input.notes?.trim() || null,
          examCounts: { create: examCountsData },
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
