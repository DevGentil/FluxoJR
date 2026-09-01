"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

const schema = z
  .object({
    senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, {
    message: "As duas senhas não são iguais.",
    path: ["confirmacao"],
  });

/** Troca a senha da própria conta e encerra o estado provisório.
 *
 * Troca a SUA senha e mais nada: usa a sessão do próprio usuário, não a
 * chave de serviço. Assim esta tela não tem como ser desviada para alterar
 * a senha de outra pessoa, nem por engano nem de propósito. */
export async function trocarSenha(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(schema, formData);
  if ("error" in result) return result;

  const estado = await runMutation(async () => {
    const user = await requireUser();
    if (!user) throw new Error("Sessão expirada. Faça login novamente.");

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: result.data.senha });
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
  });

  if (estado?.error) return estado;
  redirect("/dashboard");
}
