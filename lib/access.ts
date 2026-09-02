import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { MODO_ABERTO, requireUser } from "@/lib/auth";
import {
  MODULES,
  MODULE_LABELS,
  can,
  levelFor,
  visibleModules,
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

/** As empresas que uma conta enxerga.
 *
 * Recebe a conta em vez de buscá-la para poder ser reaproveitada por quem já
 * tem uma em mãos — ver `companyIdsVisiveis`. */
export async function companyIdsDaConta(conta: Conta | null): Promise<string[]> {
  if (!conta) return [];
  if (conta.holding) {
    const empresas = await prisma.company.findMany({ select: { id: true } });
    return empresas.map((c) => c.id);
  }
  return [...conta.papeis.keys()];
}

/** As empresas que a sessão atual enxerga.
 *
 * Conta da holding vê todas — inclusive as que forem criadas depois, sem
 * ninguém precisar cadastrar acesso.
 *
 * `cache` pelo mesmo motivo de `contaAtual`: numa página, `getActiveScope` e
 * `resolveCompanyIds` perguntam isto em sequência. O `cache` do React vale
 * dentro de uma renderização — num route handler ele NÃO deduplica, e é por
 * isso que a busca global resolve a conta uma vez e passa adiante em vez de
 * confiar nesta função. */
export const companyIdsVisiveis = cache(async (): Promise<string[]> => {
  return companyIdsDaConta(await contaAtual());
});

/** Os módulos que o menu deve mostrar, dado o escopo aberto.
 *
 * União, e não interseção: alguém com acesso a duas unidades, gestora numa
 * e operacional na outra, precisa enxergar Operação enquanto o escopo
 * consolidado inclui a unidade em que ela é gestora. A tela de cada módulo
 * é que recusa o que não couber naquela empresa específica.
 *
 * Recebe os ids em vez de resolver o escopo por conta própria porque
 * `lib/scope.ts` já importa este arquivo — resolver aqui fecharia o ciclo. */
export async function modulosVisiveis(companyIds: string[]): Promise<Module[]> {
  const conta = await contaAtual();
  if (!conta) return [];
  if (conta.holding) return visibleModules({ holding: true, role: null });

  const uniao = new Set<Module>();
  for (const id of companyIds) {
    for (const m of visibleModules(accessOf(conta, id))) uniao.add(m);
  }
  return MODULES.filter((m) => uniao.has(m));
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
