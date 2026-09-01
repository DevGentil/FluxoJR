"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { contaAtual } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/permissions";
import { auditar } from "@/lib/audit";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

/** Gestão de contas de acesso.
 *
 * Estas actions NÃO usam `requirePermission` como as outras. Criar acesso não
 * é uma operação "numa empresa do escopo ativo" — é uma operação SOBRE uma
 * empresa escolhida no formulário, e quem escolhe é quem está criando. Então
 * a checagem é explícita e feita contra a empresa alvo, nunca contra o cookie
 * de escopo. */

/** Quem pode mexer em contas, e em quais unidades.
 *
 * Duas regras que valem mais que a matriz de permissão:
 *
 * - **Gestor nunca cria conta de holding.** Sem isso, qualquer gestor se
 *   promoveria a acesso irrestrito em um clique — a escalada de privilégio
 *   mais óbvia que existe.
 * - **Gestor só mexe nas unidades onde é gestor.** Ter o papel numa unidade
 *   não dá poder sobre outra em que a pessoa é só operacional. */
async function quemAdministra() {
  const conta = await contaAtual();
  if (!conta) throw new Error("Sessão expirada. Faça login novamente.");
  if (conta.holding) return { conta, holding: true as const, unidades: null };

  const unidades = [...conta.papeis.entries()]
    .filter(([, papel]) => papel === "GESTOR")
    .map(([companyId]) => companyId);

  if (unidades.length === 0) {
    throw new Error("Sua conta não pode gerenciar acessos.");
  }
  return { conta, holding: false as const, unidades };
}

function exigeUnidade(
  admin: Awaited<ReturnType<typeof quemAdministra>>,
  companyIds: string[]
) {
  if (admin.holding) return;
  const permitidas = new Set(admin.unidades);
  const fora = companyIds.filter((id) => !permitidas.has(id));
  if (fora.length > 0) {
    throw new Error("Você só pode gerenciar acessos das unidades em que é gestor.");
  }
}

const acessoSchema = z.object({
  companyId: z.string().min(1),
  role: z.enum(ROLES),
});

const criarSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da pessoa."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  senha: z.string().min(8, "A senha inicial precisa ter ao menos 8 caracteres."),
  holding: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  acessos: z
    .string()
    .transform((v) => JSON.parse(v || "[]"))
    .pipe(z.array(acessoSchema)),
});

export async function criarConta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(criarSchema, formData);
  if ("error" in result) return result;
  const { name, email, senha, holding, acessos } = result.data;

  return runMutation(async () => {
    const admin = await quemAdministra();

    if (holding && !admin.holding) {
      throw new Error("Somente uma conta da holding pode criar outra conta de holding.");
    }
    if (!holding && acessos.length === 0) {
      throw new Error("Escolha ao menos uma unidade e o papel da pessoa nela.");
    }
    exigeUnidade(admin, acessos.map((a) => a.companyId));

    if (await prisma.appUser.findUnique({ where: { email } })) {
      throw new Error("Já existe uma conta com esse e-mail.");
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(
        error?.message.toLowerCase().includes("already")
          ? "Esse e-mail já tem login no sistema."
          : "Não foi possível criar o login. Tente novamente."
      );
    }

    try {
      await prisma.appUser.create({
        data: {
          authId: data.user.id,
          email,
          name,
          holding,
          // Senha veio de outra pessoa: a troca no primeiro acesso é exigida.
          senhaProvisoria: true,
          createdById: admin.conta.id === "dev" ? null : admin.conta.id,
          access: holding ? undefined : { create: acessos },
        },
      });
    } catch (e) {
      // O login já existe no Supabase mas o registro daqui falhou. Sem
      // desfazer, sobra um usuário que autentica e não tem conta — que o
      // sistema trata como "sem acesso a nada", mas que também bloqueia
      // recriar com o mesmo e-mail. Melhor limpar.
      await sb.auth.admin.deleteUser(data.user.id).catch(() => {});
      throw e;
    }

    await auditarConta("criou", { name, email, holding, acessos });
    revalidatePath("/contas");
  });
}

/** Criar e alterar acesso é a operação mais privilegiada do sistema — ela
 * decide quem pode fazer todas as outras. Vai para o log sempre, mesmo
 * quando nada de dinheiro se moveu. */
async function auditarConta(
  acao: "criou" | "alterou" | "desativou",
  conta: { name: string; email: string; holding: boolean; acessos: { companyId: string; role: string }[] },
  extra?: string
) {
  const onde = conta.holding
    ? "acesso de holding, todas as unidades"
    : conta.acessos.length > 0
      ? await descreverAcessos(conta.acessos)
      : "sem unidade";

  await auditar({
    // Evento do sistema: uma conta não pertence a uma unidade só.
    module: "contas",
    acao,
    entidade: `Conta de ${conta.name} <${conta.email}>`,
    resumo: extra ? `${onde} · ${extra}` : onde,
  });
}

async function descreverAcessos(acessos: { companyId: string; role: string }[]) {
  const empresas = await prisma.company.findMany({
    where: { id: { in: acessos.map((a) => a.companyId) } },
    select: { id: true, name: true },
  });
  const nomes = new Map(empresas.map((e) => [e.id, e.name]));
  return acessos.map((a) => `${ROLE_LABELS[a.role as Role]} em ${nomes.get(a.companyId) ?? "unidade"}`).join(", ");
}

const editarSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Informe o nome da pessoa."),
  active: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  holding: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  acessos: z
    .string()
    .transform((v) => JSON.parse(v || "[]"))
    .pipe(z.array(acessoSchema)),
});

export async function editarConta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(editarSchema, formData);
  if ("error" in result) return result;
  const { id, name, active, holding, acessos } = result.data;

  return runMutation(async () => {
    const admin = await quemAdministra();

    const alvo = await prisma.appUser.findUnique({
      where: { id },
      include: { access: { select: { companyId: true } } },
    });
    if (!alvo) throw new Error("Conta não encontrada.");

    if (alvo.id === admin.conta.id && (!active || (alvo.holding && !holding))) {
      throw new Error("Você não pode remover o próprio acesso.");
    }
    if (!admin.holding) {
      if (alvo.holding || holding) {
        throw new Error("Somente uma conta da holding pode alterar contas de holding.");
      }
      // Precisa mandar nas unidades que a conta TINHA e nas que vai ficar —
      // senão daria para arrancar alguém de uma unidade alheia.
      exigeUnidade(admin, [
        ...alvo.access.map((a) => a.companyId),
        ...acessos.map((a) => a.companyId),
      ]);
    }
    if (!holding && acessos.length === 0) {
      throw new Error("Escolha ao menos uma unidade e o papel da pessoa nela.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.userAccess.deleteMany({ where: { userId: id } });
      await tx.appUser.update({
        where: { id },
        data: {
          name,
          active,
          holding,
          access: holding ? undefined : { create: acessos },
        },
      });
    });

    await auditarConta(
      "alterou",
      { name, email: alvo.email, holding, acessos },
      active === alvo.active ? undefined : active ? "reativada" : "desativada"
    );
    revalidatePath("/contas");
  });
}

const senhaSchema = z.object({
  id: z.string().min(1),
  senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
});

/** Define uma nova senha para outra pessoa — o "esqueci a senha" da casa.
 *
 * A conta volta a `senhaProvisoria`, então quem entrar com ela é obrigado a
 * escolher a própria antes de usar o sistema. */
export async function redefinirSenha(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(senhaSchema, formData);
  if ("error" in result) return result;
  const { id, senha } = result.data;

  return runMutation(async () => {
    const admin = await quemAdministra();

    const alvo = await prisma.appUser.findUnique({
      where: { id },
      include: { access: { select: { companyId: true } } },
    });
    if (!alvo) throw new Error("Conta não encontrada.");
    if (!admin.holding) {
      if (alvo.holding) throw new Error("Somente uma conta da holding pode redefinir senha de holding.");
      exigeUnidade(admin, alvo.access.map((a) => a.companyId));
    }

    const { error } = await supabaseAdmin().auth.admin.updateUserById(alvo.authId, {
      password: senha,
    });
    if (error) throw new Error("Não foi possível redefinir a senha. Tente novamente.");

    await prisma.appUser.update({ where: { id }, data: { senhaProvisoria: true } });
    await auditar({
      module: "contas",
      acao: "alterou",
      entidade: `Conta de ${alvo.name} <${alvo.email}>`,
      resumo: "senha redefinida por terceiro; troca exigida no próximo acesso",
    });
    revalidatePath("/contas");
  });
}

/** Desativa em vez de excluir.
 *
 * Excluir levaria junto o vínculo de quem criou quais contas, que é o único
 * rastro de acesso que existe até o log de auditoria ficar pronto. Conta
 * inativa não entra — `contaAtual` já a trata como conta nenhuma. */
export async function desativarConta(id: string): Promise<ActionState> {
  return runMutation(async () => {
    const admin = await quemAdministra();
    if (id === admin.conta.id) throw new Error("Você não pode desativar a própria conta.");

    const alvo = await prisma.appUser.findUnique({
      where: { id },
      include: { access: { select: { companyId: true } } },
    });
    if (!alvo) throw new Error("Conta não encontrada.");
    if (!admin.holding) {
      if (alvo.holding) throw new Error("Somente uma conta da holding pode desativar contas de holding.");
      exigeUnidade(admin, alvo.access.map((a) => a.companyId));
    }

    await prisma.appUser.update({ where: { id }, data: { active: false } });
    await auditar({
      module: "contas",
      acao: "desativou",
      entidade: `Conta de ${alvo.name} <${alvo.email}>`,
      resumo: "acesso removido; a conta continua na lista",
    });
    revalidatePath("/contas");
  });
}
