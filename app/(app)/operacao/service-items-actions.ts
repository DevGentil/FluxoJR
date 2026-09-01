"use server";

import { z } from "zod";
import { revalidateRepassesModule } from "@/lib/revalidate-repasses";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";
import { SERVICE_CATEGORIES, PAYERS, NO_PAYER, type Payer } from "@/lib/service-catalog";


/** Campo de dinheiro vindo de <input type="number">: vazio vira null (o
 * item simplesmente não tem preço, caso de plantão e auxílio). */
const optionalMoney = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Informe um valor válido.");

const serviceItemSchema = z.object({
  name: z.string().min(1, "Informe o nome do item."),
  group: z
    .string()
    .trim()
    .transform((v) => v || null),
  category: z.enum(SERVICE_CATEGORIES),
  payer: z
    .string()
    .trim()
    .transform((v) => (v === "" || v === NO_PAYER ? null : v))
    .refine((v) => v === null || (PAYERS as readonly string[]).includes(v), "Convênio inválido.")
    .transform((v) => v as Payer | null),
  price: optionalMoney,
  operationalCost: optionalMoney.transform((v) => v ?? 0),
  active: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
});

export async function createServiceItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(serviceItemSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("operacao");
    await prisma.serviceItem.create({ data: { ...result.data, companyId } });

    revalidateRepassesModule();
  });
}

export async function updateServiceItem(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = parseForm(serviceItemSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("operacao");
    const { count } = await prisma.serviceItem.updateMany({
      where: { id, companyId },
      data: result.data,
    });
    if (count === 0) throw new Error("Item não encontrado.");

    revalidateRepassesModule();
  });
}

const ARQUIVAR_EM_VEZ_DE_EXCLUIR =
  'Desmarque "ativo" para parar de usá-lo sem perder o histórico.';

export async function deleteServiceItem(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("operacao");
    const existing = await prisma.serviceItem.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error("Item não encontrado.");

    // O contrato precisa ser checado À MÃO. A FK de DoctorServiceRate é
    // `Cascade`, então o banco apagaria os valores combinados sem reclamar —
    // era possível excluir um item e levar junto o contrato de vários
    // médicos, em silêncio. Só a linha de lançamento é `Restrict`, e por
    // isso só ela era barrada.
    const contratos = await prisma.doctorServiceRate.count({ where: { serviceItemId: id } });
    if (contratos > 0) {
      const medicos = await prisma.doctorServiceRate.findMany({
        where: { serviceItemId: id },
        select: { doctor: { select: { name: true } } },
        distinct: ["doctorId"],
        take: 4,
      });
      const nomes = medicos.map((m) => m.doctor.name);
      const resto = contratos - nomes.length;
      throw new Error(
        `Esse item está no contrato de ${nomes.join(", ")}${resto > 0 ? ` e mais ${resto}` : ""}. ` +
          `Excluir apagaria o valor combinado com ${nomes.length > 1 ? "eles" : "ele"}. ` +
          ARQUIVAR_EM_VEZ_DE_EXCLUIR
      );
    }

    try {
      await prisma.serviceItem.delete({ where: { id } });
    } catch {
      // Sobra o `Restrict` da linha de lançamento, que o banco barra.
      throw new Error(`Esse item já tem repasses lançados. ${ARQUIVAR_EM_VEZ_DE_EXCLUIR}`);
    }

    revalidateRepassesModule();
  });
}
