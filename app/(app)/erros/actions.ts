"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { contaAtual } from "@/lib/access";
import { runMutation, type ActionState } from "@/lib/actions-utils";
import { DIAS_ANTIGO } from "./constantes";

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

function limiteDeAntiguidade() {
  return new Date(Date.now() - DIAS_ANTIGO * 24 * 60 * 60 * 1000);
}

/** Quantos registros cada limpeza apagaria.
 *
 * Serve para o botão dizer o número ANTES de a pessoa confirmar: "apagar
 * 143 registros" é uma decisão; "limpar antigos" é um pulo no escuro. */
export async function contarParaLimpeza() {
  await exigeHolding();
  const [antigos, total] = await Promise.all([
    prisma.errorLog.count({ where: { at: { lt: limiteDeAntiguidade() } } }),
    prisma.errorLog.count(),
  ]);
  return { antigos, total };
}

export async function excluirErro(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await exigeHolding();
    const { count } = await prisma.errorLog.deleteMany({ where: { id } });
    if (count === 0) throw new Error("Registro não encontrado.");
    revalidatePath("/erros");
    revalidatePath("/dashboard");
  });
}

export async function excluirErros(ids: string[]): Promise<ActionState> {
  return runMutation(async () => {
    await exigeHolding();
    if (ids.length === 0) throw new Error("Nenhum registro selecionado.");
    const { count } = await prisma.errorLog.deleteMany({ where: { id: { in: ids } } });
    if (count === 0) throw new Error("Nenhum registro encontrado.");
    revalidatePath("/erros");
    revalidatePath("/dashboard");
  });
}

/** Apaga o que passou de `DIAS_ANTIGO`, vistos ou não.
 *
 * Não filtra por `seen` de propósito: um erro de mês passado que ninguém
 * olhou também já não vai ser investigado, e poupá-lo faria a limpeza
 * deixar exatamente o lixo mais velho para trás. */
export async function excluirAntigos(): Promise<ActionState> {
  return runMutation(async () => {
    await exigeHolding();
    const { count } = await prisma.errorLog.deleteMany({
      where: { at: { lt: limiteDeAntiguidade() } },
    });
    if (count === 0) throw new Error(`Nenhum registro com mais de ${DIAS_ANTIGO} dias.`);
    revalidatePath("/erros");
    revalidatePath("/dashboard");
  });
}

export async function excluirTodos(): Promise<ActionState> {
  return runMutation(async () => {
    await exigeHolding();
    const { count } = await prisma.errorLog.deleteMany({});
    if (count === 0) throw new Error("Não há registros para apagar.");
    revalidatePath("/erros");
    revalidatePath("/dashboard");
  });
}
