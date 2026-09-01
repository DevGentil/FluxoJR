"use server";

import { redirect } from "next/navigation";
import { definirSenhaDaPropriaConta, novaSenhaSchema } from "@/lib/senha";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

/** Fecha a recuperação por e-mail.
 *
 * A sessão aqui é a que o link criou, e é ela que autoriza a troca: sem ter
 * aberto um link válido não há sessão nenhuma, e `definirSenhaDaPropriaConta`
 * recusa. Não é preciso reconferir o token — ele já virou sessão no handler. */
export async function definirSenha(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(novaSenhaSchema, formData);
  if ("error" in result) return result;

  const estado = await runMutation(() => definirSenhaDaPropriaConta(result.data.senha));
  if (estado?.error) return estado;

  redirect("/dashboard");
}
