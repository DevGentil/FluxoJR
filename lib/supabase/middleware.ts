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

  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
