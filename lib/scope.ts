import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { contaAtual, companyIdsVisiveis, requirePermission } from "@/lib/access";
import type { Level, Module } from "@/lib/permissions";

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

/** Resolve um escopo para a lista de ids de empresa que ele abrange, já
 * cortada pelo que a conta enxerga.
 *
 * O corte é a metade de leitura da mesma correção que `getActiveCompanyId`
 * faz na escrita. Sem ele, alguém sem acesso à holding escolhia
 * "Holding (todas as empresas)" no seletor e as telas consolidadas — Balanço,
 * Relatórios, Operação — somavam unidades que aquela conta não pode ver.
 * Proteger só a escrita deixaria o número aberto para quem não deveria
 * enxergá-lo, que num sistema financeiro é metade do problema. */
export async function resolveCompanyIds(scope: Scope): Promise<string[]> {
  const doEscopo = await companyIdsDoEscopo(scope);
  const visiveis = await companyIdsVisiveis();
  const permitidas = new Set(visiveis);
  return doEscopo.filter((id) => permitidas.has(id));
}

async function companyIdsDoEscopo(scope: Scope): Promise<string[]> {
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

/** A empresa em que a ação vai gravar, já confirmada como acessível.
 *
 * Helper para as telas e actions operacionais, que só fazem sentido para UMA
 * empresa por vez (ex: cadastrar uma conta bancária).
 *
 * O escopo vem de um cookie, e cookie é dado do cliente: até aqui a única
 * validação era "essa empresa existe?", então qualquer sessão trocava o
 * valor e escrevia na unidade que quisesse. Agora vale "essa conta tem
 * acesso a essa empresa?".
 *
 * A checagem mora aqui de propósito — são 49 chamadas espalhadas por 16
 * arquivos de action, e todas passam por este funil. Uma correção, o
 * sistema inteiro coberto; e nenhuma action futura pode esquecer de fazer
 * a verificação, porque ela não é opcional no caminho. */
export async function getActiveCompanyId(module?: Module, minimo: Level = "editar"): Promise<string> {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    throw new Error("Selecione uma empresa específica para essa ação.");
  }

  const conta = await contaAtual();
  if (!conta) throw new Error("Sua conta não tem acesso a este sistema.");
  if (!conta.holding && !conta.papeis.has(scope.companyId)) {
    throw new Error("Sua conta não tem acesso a essa unidade.");
  }

  // O módulo é opcional na assinatura só para não quebrar quem já chamava.
  // Toda action de mutação passa o dela — é assim que a permissão por papel
  // chega às 42 chamadas sem depender de ninguém lembrar de checar antes.
  if (module) await requirePermission(scope.companyId, module, minimo);

  return scope.companyId;
}

/** Guard para as actions de gestão de Grupos/Empresas.
 *
 * Duas exigências. A primeira é de escopo: criar ou apagar empresa só faz
 * sentido na visão consolidada. A segunda é de conta — **isso é operação de
 * holding**. O papel de Gestor dá "editar" no módulo Empresas para a pessoa
 * manter os dados da própria unidade (CNPJ, documentos societários); não para
 * cadastrar unidade nova nem apagar a do vizinho. Sem esta linha, um gestor
 * que escolhesse a visão consolidada criaria empresas à vontade. */
export async function requireConsolidatedScope(): Promise<void> {
  const scope = await getActiveScope();
  if (scope.type === "company") {
    throw new Error(
      "Selecione a visão consolidada (grupo ou holding) no menu à esquerda para gerenciar empresas/grupos."
    );
  }

  const conta = await contaAtual();
  if (!conta?.holding) {
    throw new Error("Somente uma conta da holding pode criar ou remover empresas e grupos.");
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
