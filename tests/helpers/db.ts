import { prisma } from "@/lib/prisma";

// Em NODE_ENV=test, lib/prisma.ts já aponta para DATABASE_URL_TEST — ver
// tests/setup.ts, que também garante essa variável antes de qualquer teste
// rodar. Reexportado aqui com um nome explícito para deixar claro, dentro dos
// testes, que essa instância é a do banco de teste.
export const testPrisma = prisma;

/** Limpa todas as tabelas do domínio, respeitando a ordem de FKs. Roda antes
 * de cada teste de integração para garantir isolamento entre eles. */
export async function resetDb() {
  await testPrisma.cashClosingLine.deleteMany();
  await testPrisma.cashClosing.deleteMany();
  await testPrisma.transaction.deleteMany();
  await testPrisma.scheduledEntry.deleteMany();
  await testPrisma.importBatch.deleteMany();
  await testPrisma.category.deleteMany();
  await testPrisma.supplier.deleteMany();
  await testPrisma.document.deleteMany();
  await testPrisma.account.deleteMany();
  await testPrisma.company.deleteMany();
  await testPrisma.group.deleteMany();
}

export async function createTestCompany(name = "Empresa de Teste") {
  return testPrisma.company.create({ data: { name } });
}
