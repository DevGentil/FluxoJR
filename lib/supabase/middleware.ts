import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { MODO_ABERTO } from "@/lib/auth";

/** Cabecalho com a rota pedida.
 *
 * Layout de Server Component nao recebe o pathname — e o layout e o unico
 * lugar por onde TODA pagina passa. Sem isto, a checagem de permissao de
 * leitura teria que ser repetida em cada page.tsx, e bastaria alguem
 * esquecer numa tela nova para abrir o buraco de novo. */
export const HEADER_ROTA = "x-rota";

function comRota(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(HEADER_ROTA, request.nextUrl.pathname);
  return { request: { headers } };
}

/** Rotas que abrem sem sessão.
 *
 * Recuperação de senha precisa estar aqui pelo motivo óbvio: quem esqueceu a
 * senha não tem como fazer login antes. Sem esta lista, o `redirect` abaixo
 * mandava a pessoa de volta para /login num laço sem saída. */
const ROTAS_PUBLICAS = ["/login", "/recuperar-senha"];

export function ehPublica(pathname: string) {
  return ROTAS_PUBLICAS.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next(comRota(request));

  // Modo aberto: sem login, para desenvolvimento local. Fora de produção
  // apenas — ver o comentário de `MODO_ABERTO`, que explica por que a
  // ausência das variáveis não pode, sozinha, destrancar o sistema.
  if (MODO_ABERTO) {
    return supabaseResponse;
  }

  // Produção sem Supabase configurado: nada passa. Falha segura.
  if (!isSupabaseConfigured) {
    return new NextResponse("Autenticação não configurada.", { status: 503 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next(comRota(request));
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !ehPublica(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Só /login devolve quem já entrou. /recuperar-senha não: além de ser onde
  // a pessoa cai já autenticada pelo link do e-mail, trocar a senha estando
  // logado é um pedido legítimo.
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
