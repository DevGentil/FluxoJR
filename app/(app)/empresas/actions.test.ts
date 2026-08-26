import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createGroup, createCompany, updateCompany, deleteCompany } from "./actions";

beforeEach(resetDb);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

// tests/setup.ts mocka next/headers sem cookie de escopo, então
// getActiveScope() sempre cai no fallback "primeira empresa" (escopo de
// uma única empresa) nesses testes — exatamente o cenário que deve ser
// bloqueado por requireConsolidatedScope().
describe("gestão de grupos/empresas exige escopo consolidado", () => {
  it("recusa criar grupo em escopo de empresa única", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createGroup(undefined, formData({ name: "AmorSaude" }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.group.findMany()).resolves.toHaveLength(0);
  });

  it("recusa criar empresa em escopo de empresa única", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createCompany(undefined, formData({ name: "Nova Unidade", cnpj: "11.222.333/0001-44" }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.company.count()).resolves.toBe(1);
  });

  it("recusa editar empresa em escopo de empresa única", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await updateCompany(company.id, undefined, formData({ name: "Renomeada" }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.company.findUniqueOrThrow({ where: { id: company.id } })).resolves.toMatchObject({
      name: "Empresa",
    });
  });

  it("recusa excluir empresa em escopo de empresa única", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    await testPrisma.company.create({ data: { name: "Outra" } });

    const result = await deleteCompany(company.id);

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.company.count()).resolves.toBe(2);
  });
});

describe("createCompany", () => {
  it("recusa cadastrar empresa sem CNPJ", async () => {
    const result = await createCompany(undefined, formData({ name: "Nova Unidade", cnpj: "" }));

    expect(result?.error).toMatch(/cnpj/i);
    await expect(testPrisma.company.count()).resolves.toBe(0);
  });
});
