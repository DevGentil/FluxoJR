import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/** Modo aberto: o app roda sem login, para desenvolvimento local antes de
 * existir um projeto Supabase.
 *
 * Depende do ambiente, e não só das variáveis estarem presentes. Antes
 * bastava `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * faltarem para o middleware parar de proteger as rotas e `requireUser()`
 * passar a devolver `null` para todo mundo — ou seja, um deploy com a
 * variável errada, renomeada ou não propagada abriria o sistema inteiro
 * para a internet, em silêncio e sem erro nenhum no log.
 *
 * Em produção sem Supabase configurado o app agora recusa, que é a falha
 * segura: melhor fora do ar do que aberto. */
export const MODO_ABERTO = !isSupabaseConfigured && process.env.NODE_ENV !== "production";

const SEM_AUTH_EM_PRODUCAO =
  "Autenticação não configurada. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.";

/**
 * Defesa em profundidade: além do middleware (proxy.ts) protegendo as rotas,
 * toda server action de mutação também confirma a sessão diretamente — server
 * actions são endpoints POST próprios e não devem depender só da navegação
 * ter passado pelo middleware.
 */
export async function requireUser() {
  if (MODO_ABERTO) return null;
  if (!isSupabaseConfigured) throw new Error(SEM_AUTH_EM_PRODUCAO);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  return user;
}
