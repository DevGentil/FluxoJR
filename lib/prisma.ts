import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Em testes, aponta para um banco isolado (DATABASE_URL_TEST) em vez do banco
// de dev/produção — assim os testes de integração podem importar as server
// actions diretamente sem nenhuma injeção de dependência.
const connectionString =
  process.env.NODE_ENV === "test" ? process.env.DATABASE_URL_TEST : env.DATABASE_URL;

if (process.env.NODE_ENV === "test" && !connectionString) {
  throw new Error("DATABASE_URL_TEST não configurado. Veja .env.test.example.");
}

const adapter = new PrismaPg({ connectionString, max: 1 });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
