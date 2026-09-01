import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Regras da nova senha, compartilhadas pelas duas telas que a definem:
 * a troca obrigatória do primeiro acesso e a recuperação por e-mail. */
export const novaSenhaSchema = z
  .object({
    senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, {
    message: "As duas senhas não são iguais.",
    path: ["confirmacao"],
  });

/** Grava a senha da PRÓPRIA conta e encerra o estado provisório.
 *
 * Usa a sessão de quem está logado, nunca a chave de serviço — é o que
 * garante que nem esta tela nem a de recuperação consigam ser desviadas
 * para alterar a senha de outra pessoa.
 *
 * Vale para as duas origens de sessão: a de quem entrou com a senha
 * provisória e a que o link de recuperação acabou de criar. Em ambos os
 * casos `senhaProvisoria` cai, porque a senha passou a ser escolhida pelo
 * dono da conta. */
export async function definirSenhaDaPropriaConta(senha: string) {
  const user = await requireUser();
  if (!user) throw new Error("Sessão expirada. Faça login novamente.");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    // O Supabase recusa repetir a senha atual, entre outras regras. A
    // mensagem dele é em inglês; a daqui é a que a pessoa entende.
    throw new Error(
      error.message.toLowerCase().includes("different")
        ? "A nova senha precisa ser diferente da atual."
        : "Não foi possível trocar a senha. Tente novamente."
    );
  }

  await prisma.appUser.updateMany({
    where: { authId: user.id },
    data: { senhaProvisoria: false },
  });
}
