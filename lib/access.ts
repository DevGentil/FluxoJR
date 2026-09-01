import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { MODO_ABERTO, requireUser } from "@/lib/auth";
import {
  MODULE_LABELS,
  can,
  levelFor,
  type Access,
  type Level,
  type Module,
  type Role,
} from "@/lib/permissions";

/** Lê quem é o usuário da sessão e o que ele pode fazer.
 *
 * A regra de "pode ou não pode" mora em `lib/permissions.ts`, que é pura e
 * testada sem banco. Aqui só se busca o dado e se entrega a resposta —
 * separação que existe para a matriz continuar auditável de bater o olho,
 * sem depender de Prisma nem de sessão para ser lida. */

export interface Conta {
  id: string;
  name: string;
  email: string;
  holding: boolean;
  senhaProvisoria: boolean;
  /** Papel por empresa. Vazio numa conta da holding, que não usa papel. */
  papeis: Map<string, Role>;
}

/** A conta do sistema por trás da sessão atual, ou `null`.
 *
 * `cache` do React deduplica dentro da mesma requisição: a mesma página
 * chega a perguntar isso uma dúzia de vezes (menu, cabeçalho, cada seção),
 * e sem isso seria uma consulta por pergunta. */
export const contaAtual = cache(async (): Promise<Conta | null> => {
  // `requireUser` lança quando a sessão caiu, que é o certo numa action —
  // mas aqui isso viraria página de erro no meio de um layout. Para leitura,
  // sessão ausente é "conta nenhuma", e quem manda para o login é o
  // middleware.
  const user = await requireUser().catch(() => null);

  // Modo aberto (desenvolvimento local, sem Supabase): não existe sessão
  // para consultar. Vale como holding, senão não se desenvolve.
  if (!user) return MODO_ABERTO ? CONTA_DEV : null;

  const registro = await prisma.appUser.findUnique({
    where: { authId: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      holding: true,
      active: true,
      senhaProvisoria: true,
      access: { select: { companyId: true, role: true } },
    },
  });

  // Existe no Supabase mas não aqui: conta criada por fora do sistema, ou
  // já removida. Sem acesso a nada — a falha segura.
  if (!registro || !registro.active) return null;

  return {
    id: registro.id,
    name: registro.name,
    email: registro.email,
    holding: registro.holding,
    senhaProvisoria: registro.senhaProvisoria,
    papeis: new Map(registro.access.map((a) => [a.companyId, a.role as Role])),
  };
});

const CONTA_DEV: Conta = {
  id: "dev",
  name: "Desenvolvimento",
  email: "dev@local",
  holding: true,
  senhaProvisoria: false,
  papeis: new Map(),
};

/** O que esta conta pode fazer NESTA empresa. */
export function accessOf(conta: Conta | null, companyId: string): Access {
  if (!conta) return { holding: false, role: null };
  if (conta.holding) return { holding: true, role: null };
  return { holding: false, role: conta.papeis.get(companyId) ?? null };
}

/** Acesso da sessão atual a uma empresa. */
export async function accessFor(companyId: string): Promise<Access> {
  return accessOf(await contaAtual(), companyId);
}

/** As empresas que esta conta enxerga.
 *
 * Conta da holding vê todas — inclusive as que forem criadas depois, sem
 * ninguém precisar cadastrar acesso. */
export async function companyIdsVisiveis(): Promise<string[]> {
  const conta = await contaAtual();
  if (!conta) return [];
  if (conta.holding) {
    const empresas = await prisma.company.findMany({ select: { id: true } });
    return empresas.map((c) => c.id);
  }
  return [...conta.papeis.keys()];
}

export class SemPermissaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemPermissaoError";
  }
}

/** Barra a operação se a conta não puder. É o que as server actions chamam.
 *
 * A mensagem nomeia o módulo em vez de dizer só "sem permissão": quem
 * esbarrar precisa saber o que pedir ao gestor, e um erro genérico vira
 * chamado de suporte. */
export async function requirePermission(
  companyId: string,
  module: Module,
  minimo: Level = "editar"
): Promise<Access> {
  const access = await accessFor(companyId);
  if (!can(access, module, minimo)) {
    const tem = levelFor(access, module);
    throw new SemPermissaoError(
      tem === "nenhum"
        ? `Sua conta não tem acesso a ${MODULE_LABELS[module]} nesta unidade.`
        : `Sua conta pode ${tem} em ${MODULE_LABELS[module]}, mas esta ação exige ${minimo}.`
    );
  }
  return access;
}
