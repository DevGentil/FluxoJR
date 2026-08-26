import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "fluxojr_scope";

export type Scope =
  | { type: "company"; companyId: string }
  | { type: "group"; groupId: string }
  | { type: "all" };

/** Cria a empresa padrão se nenhuma existir ainda — só deveria acontecer no
 * bootstrap de uma instalação nova, e roda uma única vez em instrumentation.ts.
 * Mantida aqui só como rede de segurança (ex: runtime que pula o hook). */
async function ensureAtLeastOneCompany() {
  const count = await prisma.company.count();
  if (count === 0) {
    await prisma.company.create({ data: { name: "Minha Empresa" } });
  }
}

/** Lê o escopo ativo (empresa/grupo/holding) do cookie, validando contra o
 * banco. Sem cookie válido, cai para a primeira empresa cadastrada. */
export async function getActiveScope(): Promise<Scope> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;

  if (raw === "all") return { type: "all" };

  if (raw?.startsWith("group:")) {
    const groupId = raw.slice("group:".length);
    const exists = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    if (exists) return { type: "group", groupId };
  }

  if (raw?.startsWith("company:")) {
    const companyId = raw.slice("company:".length);
    const exists = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (exists) return { type: "company", companyId };
  }

  let first = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!first) {
    await ensureAtLeastOneCompany();
    first = await prisma.company.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  }
  return { type: "company", companyId: first.id };
}

/** Resolve um escopo para a lista de ids de empresa que ele abrange. */
export async function resolveCompanyIds(scope: Scope): Promise<string[]> {
  if (scope.type === "company") return [scope.companyId];

  if (scope.type === "group") {
    const companies = await prisma.company.findMany({
      where: { groupId: scope.groupId },
      select: { id: true },
    });
    return companies.map((c) => c.id);
  }

  const companies = await prisma.company.findMany({ select: { id: true } });
  return companies.map((c) => c.id);
}

/** Helper para as telas/actions operacionais, que só fazem sentido para UMA
 * empresa por vez (ex: cadastrar uma conta bancária). */
export async function getActiveCompanyId(): Promise<string> {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    throw new Error("Selecione uma empresa específica para essa ação.");
  }
  return scope.companyId;
}

/** Guard para as actions de gestão de Grupos/Empresas: só permite criar,
 * editar ou excluir grupos/empresas em escopo consolidado (grupo ou
 * holding) — uma unidade específica só pode ver os próprios dados. */
export async function requireConsolidatedScope(): Promise<void> {
  const scope = await getActiveScope();
  if (scope.type === "company") {
    throw new Error(
      "Selecione a visão consolidada (grupo ou holding) no menu à esquerda para gerenciar empresas/grupos."
    );
  }
}

export async function getScopeLabel(scope: Scope): Promise<string> {
  if (scope.type === "all") return "Holding (todas as empresas)";

  if (scope.type === "group") {
    const group = await prisma.group.findUnique({ where: { id: scope.groupId }, select: { name: true } });
    return group ? `${group.name} (consolidado)` : "Grupo (consolidado)";
  }

  const company = await prisma.company.findUnique({ where: { id: scope.companyId }, select: { name: true } });
  return company?.name ?? "Empresa";
}

export async function getGroupsWithCompanies() {
  return prisma.group.findMany({
    include: { companies: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export async function getAllCompanies() {
  return prisma.company.findMany({ orderBy: { name: "asc" }, include: { group: true } });
}
