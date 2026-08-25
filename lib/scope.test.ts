import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { resolveCompanyIds, getScopeLabel } from "./scope";

beforeEach(resetDb);

describe("resolveCompanyIds", () => {
  it("escopo 'company' resolve para um único id", async () => {
    const company = await testPrisma.company.create({ data: { name: "AS Laguna" } });
    await expect(resolveCompanyIds({ type: "company", companyId: company.id })).resolves.toEqual([company.id]);
  });

  it("escopo 'group' resolve para todas as empresas do grupo, ignorando outras", async () => {
    const grupo = await testPrisma.group.create({ data: { name: "AmorSaude" } });
    const empresaA = await testPrisma.company.create({ data: { name: "AS Laguna", groupId: grupo.id } });
    const empresaB = await testPrisma.company.create({ data: { name: "AS Contagem", groupId: grupo.id } });
    await testPrisma.company.create({ data: { name: "Fora do grupo" } });

    const ids = await resolveCompanyIds({ type: "group", groupId: grupo.id });
    expect(ids.sort()).toEqual([empresaA.id, empresaB.id].sort());
  });

  it("escopo 'all' resolve para todas as empresas cadastradas", async () => {
    const a = await testPrisma.company.create({ data: { name: "A" } });
    const b = await testPrisma.company.create({ data: { name: "B" } });

    const ids = await resolveCompanyIds({ type: "all" });
    expect(ids.sort()).toEqual([a.id, b.id].sort());
  });
});

describe("getScopeLabel", () => {
  it("retorna o nome da empresa para escopo 'company'", async () => {
    const company = await testPrisma.company.create({ data: { name: "AS Laguna" } });
    await expect(getScopeLabel({ type: "company", companyId: company.id })).resolves.toBe("AS Laguna");
  });

  it("retorna o nome do grupo com sufixo 'consolidado' para escopo 'group'", async () => {
    const grupo = await testPrisma.group.create({ data: { name: "AmorSaude" } });
    await expect(getScopeLabel({ type: "group", groupId: grupo.id })).resolves.toBe("AmorSaude (consolidado)");
  });

  it("retorna o rótulo da holding para escopo 'all'", async () => {
    await expect(getScopeLabel({ type: "all" })).resolves.toBe("Holding (todas as empresas)");
  });
});
