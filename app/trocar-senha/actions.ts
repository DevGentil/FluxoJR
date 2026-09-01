"use server";

import { redirect } from "next/navigation";
import { definirSenhaDaPropriaConta, novaSenhaSchema } from "@/lib/senha";
import { parseForm, runMutation, type ActionState } from "@/lib/actions-utils";

/** Troca obrigatória do primeiro acesso: a senha atual foi definida por
 * quem cadastrou o acesso, e o layout prende a pessoa aqui até ela escolher
 * uma que só ela saiba. */
export async function trocarSenha(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = parseForm(novaSenhaSchema, formData);
  if ("error" in result) return result;

  const estado = await runMutation(() => definirSenhaDaPropriaConta(result.data.senha));
  if (estado?.error) return estado;

  redirect("/dashboard");
}
