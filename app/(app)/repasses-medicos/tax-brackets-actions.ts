"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

const money = (label: string) =>
  z
    .string()
    .trim()
    .min(1, label)
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v >= 0, label);

const taxBracketSchema = z
  .object({
    minValue: money("Informe o valor mínimo da faixa."),
    maxValue: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Informe um valor máximo válido."),
    percent: money("Informe o percentual da faixa."),
    notes: z
      .string()
      .trim()
      .transform((v) => v || null),
  })
  .refine((d) => d.maxValue == null || d.maxValue >= d.minValue, {
    message: "O valor máximo precisa ser maior que o mínimo.",
    path: ["maxValue"],
  });

export async function createTaxBracket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(taxBracketSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    await prisma.taxBracket.create({ data: { ...result.data, companyId } });

    revalidatePath("/repasses-medicos");
  });
}

export async function updateTaxBracket(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = parseForm(taxBracketSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.taxBracket.updateMany({
      where: { id, companyId },
      data: result.data,
    });
    if (count === 0) throw new Error("Faixa não encontrada.");

    revalidatePath("/repasses-medicos");
  });
}

export async function deleteTaxBracket(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId();
    const { count } = await prisma.taxBracket.deleteMany({ where: { id, companyId } });
    if (count === 0) throw new Error("Faixa não encontrada.");

    revalidatePath("/repasses-medicos");
  });
}
