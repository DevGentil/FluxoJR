"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireConsolidatedScope } from "@/lib/scope";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

const NONE = "__none__";

const groupSchema = z.object({
  name: z.string().min(1, "Informe o nome do grupo"),
});

export async function createGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(groupSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    await requireConsolidatedScope();
    await prisma.group.create({ data: result.data });
    revalidatePath("/empresas");
    revalidatePath("/", "layout");
  });
}

export async function updateGroup(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(groupSchema, formData);
  if ("error" in result) return result;

  return runMutation(async () => {
    await requireUser();
    await requireConsolidatedScope();
    const { count } = await prisma.group.updateMany({ where: { id }, data: result.data });
    if (count === 0) throw new Error("Grupo não encontrado.");
    revalidatePath("/empresas");
    revalidatePath("/", "layout");
  });
}

export async function deleteGroup(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    await requireConsolidatedScope();
    const { count } = await prisma.group.deleteMany({ where: { id } });
    if (count === 0) throw new Error("Grupo não encontrado.");
    revalidatePath("/empresas");
    revalidatePath("/", "layout");
  });
}

const companySchema = z.object({
  name: z.string().min(1, "Informe o nome da empresa"),
  cnpj: z.string().optional(),
  groupId: z.string().optional(),
});

// Ao cadastrar uma empresa nova, CNPJ e grupo passam a ser obrigatórios —
// toda empresa nasce associada a um grupo/marca, mesmo que seja a única
// unidade dele hoje, para já estar pronta caso a marca expanda. Empresas já
// existentes sem CNPJ/grupo continuam editáveis normalmente (updateCompany
// usa o schema acima, sem essas exigências).
const createCompanySchema = companySchema.extend({
  cnpj: z.string().min(1, "Informe o CNPJ da empresa"),
  groupId: z.string().min(1, "Selecione um grupo/marca"),
});

function stripNone(raw: Record<string, FormDataEntryValue>) {
  const clean = { ...raw };
  if (clean.groupId === NONE) clean.groupId = "";
  return clean;
}

export async function createCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createCompanySchema.safeParse(stripNone(Object.fromEntries(formData)));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  return runMutation(async () => {
    await requireUser();
    await requireConsolidatedScope();
    const { groupId, ...rest } = parsed.data;
    await prisma.company.create({ data: { ...rest, groupId: groupId || null } });
    revalidatePath("/empresas");
    revalidatePath("/", "layout");
  });
}

export async function updateCompany(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = companySchema.safeParse(stripNone(Object.fromEntries(formData)));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  return runMutation(async () => {
    await requireUser();
    await requireConsolidatedScope();
    const { groupId, ...rest } = parsed.data;
    const { count } = await prisma.company.updateMany({
      where: { id },
      data: { ...rest, groupId: groupId || null },
    });
    if (count === 0) throw new Error("Empresa não encontrada.");
    revalidatePath("/empresas");
    revalidatePath("/", "layout");
  });
}

export async function deleteCompany(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    await requireConsolidatedScope();
    const remaining = await prisma.company.count();
    if (remaining <= 1) {
      throw new Error("Não é possível excluir a única empresa cadastrada.");
    }
    const { count } = await prisma.company.deleteMany({ where: { id } });
    if (count === 0) throw new Error("Empresa não encontrada.");
    revalidatePath("/empresas");
    revalidatePath("/", "layout");
  });
}
