export async function register() {
  // Só roda no runtime Node.js (não no Edge, que não tem acesso ao Postgres
  // diretamente) — evita criar a empresa padrão em paralelo em cada request,
  // já que layout.tsx e page.tsx resolvem o escopo ativo concorrentemente.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { prisma } = await import("@/lib/prisma");
  const count = await prisma.company.count();
  if (count === 0) {
    await prisma.company.create({ data: { name: "Minha Empresa" } });
  }
}

/** Guarda todo erro de servidor que o Next captura.
 *
 * Hook oficial do framework — pega o que estoura em Server Component, server
 * action e route handler, inclusive o que a tela de erro engoliu. Antes disso
 * o sistema só reportava para o terminal de quem estivesse com o `dev`
 * aberto: em produção, um erro às 9h da manhã só era descoberto se a pessoa
 * avisasse.
 *
 * O `digest` é o mesmo código que a tela mostra ao usuário. É ele que liga o
 * print que a pessoa manda no WhatsApp à linha do banco. */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { prisma } = await import("@/lib/prisma");
    const { classificarGravidade } = await import("@/lib/erro-gravidade");
    const erro = err as { message?: string; stack?: string; digest?: string };

    const message = erro?.message?.slice(0, 2000) ?? String(err).slice(0, 2000);
    const stack = erro?.stack?.slice(0, 8000) ?? null;

    await prisma.errorLog.create({
      data: {
        message,
        digest: erro?.digest ?? null,
        stack,
        route: request.path?.slice(0, 500) ?? null,
        method: request.method ?? null,
        // Classificado aqui, e não na leitura, para o filtro poder rodar no
        // banco: filtrar em memória quebraria a paginação, que precisa
        // contar o total antes de escolher a página.
        severity: classificarGravidade(message, stack),
      },
    });
  } catch {
    // Se o próprio registro falhar — banco fora do ar, que é justamente
    // quando mais erro acontece — não vale derrubar a requisição por causa
    // do log. O erro original já foi para o stderr pelo Next.
  }
}
