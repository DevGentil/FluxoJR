"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { parseForm } from "@/lib/actions-utils";

/** O `ActionState` do sistema só carrega erro, porque em toda outra action o
 * sucesso é a tela mudando. Aqui não muda nada — a pessoa continua na mesma
 * página e precisa ler que o e-mail saiu. Um tipo local resolve sem alargar
 * o contrato compartilhado por causa de um caso. */
export type EstadoRecuperacao = { error?: string; enviado?: boolean } | undefined;

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
});

/** Pede o link de redefinição de senha.
 *
 * **Responde a mesma coisa exista a conta ou não.** É deliberado: um retorno
 * diferente para e-mail cadastrado transformaria esta tela num verificador de
 * quem trabalha na holding — basta ir testando endereços. O preço é que quem
 * digitar o e-mail errado não descobre por aqui; em compensação, quem estiver
 * de fora também não descobre nada.
 *
 * Pelo mesmo motivo não há checagem contra `AppUser`: consultar o banco antes
 * de mandar só criaria a diferença de comportamento que se quer evitar. Conta
 * desativada consegue redefinir a senha e continua sem acessar nada — quem
 * decide isso é `contaAtual`, não o Supabase. */
export async function pedirRecuperacao(
  _prev: EstadoRecuperacao,
  formData: FormData
): Promise<EstadoRecuperacao> {
  const result = parseForm(schema, formData);
  if ("error" in result) return result;

  if (!isSupabaseConfigured) {
    return { error: "Recuperação de senha indisponível: autenticação não configurada." };
  }

  // A origem vem do cabeçalho para o link funcionar em qualquer ambiente
  // (local, homologação, produção) sem precisar de variável por ambiente.
  const cabecalhos = await headers();
  const origem =
    cabecalhos.get("origin") ??
    (cabecalhos.get("host") ? `https://${cabecalhos.get("host")}` : "");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(result.data.email, {
    redirectTo: `${origem}/recuperar-senha/confirmar`,
  });

  // Só o excesso de tentativas é dito em voz alta: aqui a informação é sobre
  // quem está pedindo, não sobre quem existe, então não vaza nada — e sem ela
  // a pessoa tentaria de novo achando que não funcionou.
  if (error?.status === 429) {
    return { error: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo." };
  }

  return { enviado: true };
}
