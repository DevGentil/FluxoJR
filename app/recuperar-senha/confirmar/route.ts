import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Onde o link do e-mail cai. Troca o token por uma sessão e segue para a
 * tela de nova senha.
 *
 * Precisa ser Route Handler, e não página: a troca grava os cookies da
 * sessão, e Server Component não pode gravar cookie.
 *
 * Aceita as duas formas porque o Supabase manda uma ou outra conforme o
 * modelo de e-mail do projeto:
 *
 * - `token_hash` — o formato recomendado. Verifica direto, sem depender de
 *   nada guardado no navegador, então funciona quando a pessoa pede o link
 *   no computador e abre no celular.
 * - `code` — o PKCE padrão. Exige o verificador que ficou no cookie de quem
 *   pediu, ou seja, só abre no MESMO navegador.
 *
 * Qualquer falha vai para a tela de pedido com `?expirado`, em vez de uma
 * tela de erro: link vencido é o caso comum, não uma anomalia, e a saída
 * útil é pedir outro. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}/recuperar-senha/definir`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/recuperar-senha/definir`);
  }

  return NextResponse.redirect(`${origin}/recuperar-senha?expirado=1`);
}
