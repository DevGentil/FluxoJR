"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { contaAtual } from "@/lib/access";
import { runMutation, type ActionState } from "@/lib/actions-utils";

/** Erro de sistema é assunto de quem mantém o sistema.
 *
 * Não passa por `requirePermission` porque não é operação de uma empresa —
 * o log é do software inteiro, sem unidade a que pertencer. */
async function exigeHolding() {
  const conta = await contaAtual();
  if (!conta?.holding) throw new Error("Somente a holding acessa os erros do sistema.");
}

export async function marcarVisto(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await exigeHolding();
    await prisma.errorLog.update({ where: { id }, data: { seen: true } });
    revalidatePath("/erros");
  });
}

export async function marcarTodosVistos(): Promise<void> {
  await exigeHolding();
  await prisma.errorLog.updateMany({ where: { seen: false }, data: { seen: true } });
  revalidatePath("/erros");
  revalidatePath("/dashboard");
}
