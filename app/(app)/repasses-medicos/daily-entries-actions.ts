"use server";

import { revalidateRepassesModule } from "@/lib/revalidate-repasses";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";

export interface DailyLineInput {
  serviceItemId: string;
  quantity: number;
}

export interface DailyEntryInput {
  doctorId: string;
  /** "YYYY-MM-DD" — o dia do atendimento. */
  date: string;
  /** Valor total do dia, digitado direto (como na planilha). Use quando
   * não houver detalhe por item; ignorado se `lines` vier preenchido. */
  amount?: number;
  paid: boolean;
  notes?: string;
  /** Detalhe opcional: quantos de cada item. Quando preenchido, o valor do
   * dia é calculado pelo contrato do médico. */
  lines: DailyLineInput[];
}

function validate(input: DailyEntryInput): string | null {
  if (!input.doctorId) return "Selecione o médico.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "Informe a data do lançamento.";

  const temLinhas = input.lines.length > 0;
  const temValor = input.amount != null && Number.isFinite(input.amount) && input.amount > 0;
  if (!temLinhas && !temValor) {
    return "Informe o valor do dia ou detalhe pelo menos um item.";
  }

  if (temLinhas) {
    for (const l of input.lines) {
      if (!l.serviceItemId) return "Selecione o item em todas as linhas.";
      if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
        return "Toda quantidade deve ser maior que zero.";
      }
    }
    const seen = new Set<string>();
    for (const l of input.lines) {
      if (seen.has(l.serviceItemId)) return "Não repita o mesmo item no mesmo dia.";
      seen.add(l.serviceItemId);
    }
  }
  return null;
}

/** Congela a taxa contratada do médico em cada linha — se o contrato mudar
 * depois (e muda: são 13 reajustes reais nas planilhas), o que já foi
 * lançado não se altera. */
async function buildLines(doctorId: string, lines: DailyLineInput[]) {
  if (lines.length === 0) return [];

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

export async function createDailyEntry(input: DailyEntryInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId();

    const doctor = await prisma.doctor.findFirst({ where: { id: input.doctorId, companyId } });
    if (!doctor) return { error: "Médico não encontrado." };

    const linesData = await buildLines(input.doctorId, input.lines);

    await prisma.doctorDailyEntry.create({
      data: {
        doctorId: input.doctorId,
        companyId,
        date: new Date(`${input.date}T00:00:00`),
        // Detalhou por item? O valor passa a ser derivado das linhas.
        amount: linesData.length > 0 ? null : input.amount,
        paid: input.paid,
        notes: input.notes?.trim() || null,
        lines: { create: linesData },
      },
    });

    revalidateRepassesModule();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar o lançamento." };
  }
}

export async function updateDailyEntry(id: string, input: DailyEntryInput): Promise<{ error?: string }> {
  const error = validate(input);
  if (error) return { error };

  try {
    await requireUser();
    const companyId = await getActiveCompanyId();

    const entry = await prisma.doctorDailyEntry.findFirst({ where: { id, companyId } });
    if (!entry) return { error: "Lançamento não encontrado." };

    const doctor = await prisma.doctor.findFirst({ where: { id: input.doctorId, companyId } });
    if (!doctor) return { error: "Médico não encontrado." };

    const linesData = await buildLines(input.doctorId, input.lines);

    await prisma.$transaction(async (tx) => {
      await tx.doctorDailyLine.deleteMany({ where: { entryId: id } });
      await tx.doctorDailyEntry.update({
        where: { id },
        data: {
          doctorId: input.doctorId,
          date: new Date(`${input.date}T00:00:00`),
          amount: linesData.length > 0 ? null : input.amount,
          paid: input.paid,
          notes: input.notes?.trim() || null,
          lines: { create: linesData },
        },
      });
    });

    revalidateRepassesModule();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar o lançamento." };
  }
}

export async function deleteDailyEntry(id: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.doctorDailyEntry.deleteMany({ where: { id, companyId } });
    if (count === 0) return { error: "Lançamento não encontrado." };

    revalidateRepassesModule();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível excluir o lançamento." };
  }
}

/** Marca/desmarca como pago — é o "PG"/"PAGO" que a planilha anota na
 * coluna de observação, e que hoje some no meio do texto. */
export async function toggleDailyEntryPaid(id: string, paid: boolean): Promise<{ error?: string }> {
  try {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.doctorDailyEntry.updateMany({ where: { id, companyId }, data: { paid } });
    if (count === 0) return { error: "Lançamento não encontrado." };

    revalidateRepassesModule();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível atualizar o lançamento." };
  }
}
