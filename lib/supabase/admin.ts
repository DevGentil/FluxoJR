import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/** Cliente administrativo do Supabase — cria usuário, define senha, remove
 * conta.
 *
 * A `service_role` ignora toda regra de acesso do Supabase, então o
 * `server-only` no topo não é enfeite: se algum dia este arquivo for
 * importado por engano de um Client Component, a build quebra em vez de
 * publicar a chave para o navegador.
 *
 * Nunca prefixe a variável com `NEXT_PUBLIC_`. */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada. Sem ela não é possível criar contas de acesso."
    );
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
