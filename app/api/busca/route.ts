import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { MODO_ABERTO } from "@/lib/auth";
import { buscarGlobal } from "@/lib/busca-global";

/** A busca global, chamada a cada pausa na digitação.
 *
 * É um route handler, e não uma server action, por dois motivos:
 *
 * - **Action é para mutação.** A resposta de uma server action carrega o RSC
 *   da rota atual, e o Next re-renderiza a página junto. Numa busca que
 *   dispara a cada pausa isso desmonta o layout — o diálogo fechava sozinho
 *   no meio da digitação — e refaz consultas de tela que ninguém pediu.
 * - **POST, e não GET com `?q=`.** O termo é dado de quem usa: pode ser o
 *   nome de um médico ou de um paciente. Em query string ele iria parar no
 *   log de acesso de todo intermediário do caminho; no corpo, não.
 *
 * A permissão e o escopo saem da sessão dentro de `buscarGlobal`, nunca do
 * que o cliente manda — é o que impede este endereço de virar atalho para
 * ler unidade alheia. */
export async function POST(request: Request) {
  if (!MODO_ABERTO) {
    try {
      await requireUser();
    } catch {
      return new NextResponse("Não autorizado.", { status: 401 });
    }
  }

  const corpo: unknown = await request.json().catch(() => null);
  const termo =
    corpo !== null && typeof corpo === "object" && "termo" in corpo && typeof corpo.termo === "string"
      ? corpo.termo
      : "";

  return NextResponse.json(await buscarGlobal(termo));
}
