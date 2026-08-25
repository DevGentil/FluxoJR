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
