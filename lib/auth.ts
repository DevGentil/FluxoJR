import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Defesa em profundidade: além do middleware (proxy.ts) protegendo as rotas,
 * toda server action de mutação também confirma a sessão diretamente — server
 * actions são endpoints POST próprios e não devem depender só da navegação
 * ter passado pelo middleware.
 *
 * Sem Supabase configurado, o app roda em modo aberto (dev local), então essa
 * checagem é pulada nesse caso.
 */
export async function requireUser() {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  return user;
}
