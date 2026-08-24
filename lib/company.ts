import { prisma } from "@/lib/prisma";

/**
 * V1 opera com uma única empresa. Este helper garante que ela existe e a
 * retorna, mantendo o schema pronto para múltiplas empresas (holding) mais
 * adiante sem precisar migrar dados.
 */
export async function getDefaultCompany() {
  const existing = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  return prisma.company.create({
    data: { name: "Minha Empresa" },
  });
}
