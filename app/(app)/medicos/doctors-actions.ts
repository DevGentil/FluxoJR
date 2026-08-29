"use server";

import { revalidateRepassesModule } from "@/lib/revalidate-repasses";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseDateOnly, todayDateOnly } from "@/lib/date-only";
import { contractOn } from "@/lib/doctor-rates";

/** Hoje como data de calendário, para a vigência padrão de um reajuste. */
function hoje() {
  return parseDateOnly(todayDateOnly());
}

export interface DoctorServiceRateInput {
  serviceItemId: string;
  rate: number;
  /** "YYYY-MM-DD": desde quando o valor NOVO passa a valer. Só é usado
   * quando o valor de fato mudou — reajuste retroativo é o caso comum,
   * porque a renegociação costuma ser cadastrada depois de já ter começado
   * a valer. Sem data, vale a partir de hoje. */
  validFrom?: string;
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
            validFrom: r.validFrom ? parseDateOnly(r.validFrom) : hoje(),
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

    // O contrato agora tem histórico: um reajuste ACRESCENTA uma versão em
    // vez de sobrescrever a anterior. Antes, salvar o médico apagava todas
    // as linhas e recriava — o que perdia a informação de quanto se pagava
    // antes, justamente a que as planilhas provaram existir (13 reajustes).
    const existing = await prisma.doctorServiceRate.findMany({ where: { doctorId: id } });
    const vigentes = new Map(contractOn(existing, hoje()).map((r) => [r.serviceItemId, r]));
    const itensNoFormulario = new Set(input.serviceRates.map((r) => r.serviceItemId));

    // Item tirado do contrato sai por inteiro, com todas as versões: o
    // usuário está dizendo que esse médico não atende mais esse item. Os
    // lançamentos já feitos não se abalam — cada linha tem a taxa congelada.
    const removidos = existing.filter((r) => !itensNoFormulario.has(r.serviceItemId)).map((r) => r.id);

    const novasVersoes = input.serviceRates.flatMap((r) => {
      const atual = vigentes.get(r.serviceItemId);
      if (atual && Number(atual.rate) === r.rate) return []; // nada mudou
      return [
        {
          doctorId: id,
          serviceItemId: r.serviceItemId,
          rate: r.rate,
          validFrom: r.validFrom ? parseDateOnly(r.validFrom) : hoje(),
          lastCheckedAt: new Date(),
        },
      ];
    });

    await prisma.$transaction(async (tx) => {
      if (removidos.length > 0) {
        await tx.doctorServiceRate.deleteMany({ where: { id: { in: removidos } } });
      }
      for (const v of novasVersoes) {
        // Reajuste cadastrado duas vezes com a mesma data sobrescreve o
        // próprio registro do dia, em vez de estourar a chave única.
        await tx.doctorServiceRate.upsert({
          where: {
            doctorId_serviceItemId_validFrom: {
              doctorId: v.doctorId,
              serviceItemId: v.serviceItemId,
              validFrom: v.validFrom,
            },
          },
          create: v,
          update: { rate: v.rate, lastCheckedAt: v.lastCheckedAt },
        });
      }
      await tx.doctor.update({
        where: { id },
        data: {
          name: input.name.trim(),
          specialty: input.specialty.trim(),
          document: input.document?.trim() || null,
          paymentMethod: input.paymentMethod?.trim() || null,
          active: input.active,
          notes: input.notes?.trim() || null,
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

    const doctor = await prisma.doctor.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!doctor) return { error: "Médico não encontrado." };

    // Excluir levava junto todos os dias lançados, em cascata e em
    // silêncio — apagando o histórico de quanto já foi pago a ele. Médico
    // que parou de atender é INATIVO, não excluído; a exclusão fica só
    // para quem foi cadastrado por engano. Mesma regra do catálogo.
    const lancamentos = await prisma.doctorDailyEntry.count({ where: { doctorId: id } });
    if (lancamentos > 0) {
      return {
        error: `Esse médico tem ${lancamentos} dia(s) lançado(s) e não pode ser excluído — isso apagaria o histórico do que já foi pago. Desmarque "Médico ativo" para tirá-lo da rotina sem perder os lançamentos.`,
      };
    }

    await prisma.doctor.delete({ where: { id } });

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
