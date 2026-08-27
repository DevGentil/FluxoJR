import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { uploadDreReport, deleteDreReport } from "./dre-reports-actions";

beforeEach(resetDb);

function formData(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function testFile(name = "dre-agosto.xlsx", content = "conteudo do dre") {
  return new File([content], name, { type: "application/vnd.ms-excel" });
}

describe("uploadDreReport", () => {
  it("cria o DRE realizado vinculado à empresa ativa", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await uploadDreReport(
      undefined,
      formData({ competencia: "2026-08", file: testFile(), notes: "Fechado pelo contador" })
    );

    expect(result).toBeUndefined();
    const reports = await testPrisma.dreReport.findMany();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ fileName: "dre-agosto.xlsx", notes: "Fechado pelo contador" });
    expect(reports[0].competencia.toISOString().slice(0, 7)).toBe("2026-08");
  });

  it("rejeita sem arquivo", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await uploadDreReport(undefined, formData({ competencia: "2026-08" }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.dreReport.count()).resolves.toBe(0);
  });

  it("rejeita sem mês de referência", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await uploadDreReport(undefined, formData({ file: testFile() }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.dreReport.count()).resolves.toBe(0);
  });

  it("recusa dois DREs para o mesmo mês na mesma empresa", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    await uploadDreReport(undefined, formData({ competencia: "2026-08", file: testFile() }));

    const result = await uploadDreReport(
      undefined,
      formData({ competencia: "2026-08", file: testFile("outro.pdf") })
    );

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.dreReport.count()).resolves.toBe(1);
  });
});

describe("deleteDreReport", () => {
  it("exclui só o DRE da própria empresa (escopo)", async () => {
    const empresaA = await testPrisma.company.create({ data: { name: "Empresa A" } });
    await testPrisma.company.create({ data: { name: "Empresa B" } });
    const reportDeA = await testPrisma.dreReport.create({
      data: {
        companyId: empresaA.id,
        competencia: new Date("2026-08-01"),
        fileName: "dre.xlsx",
        mimeType: "application/vnd.ms-excel",
        size: 100,
        content: Buffer.from("x"),
      },
    });

    // getActiveCompanyId() pega a empresa mais antiga — Empresa A nesse cenário.
    const result = await deleteDreReport(reportDeA.id);

    expect(result).toBeUndefined();
    await expect(testPrisma.dreReport.findUnique({ where: { id: reportDeA.id } })).resolves.toBeNull();
  });

  it("retorna erro ao tentar excluir um id inexistente", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    const result = await deleteDreReport("id-inexistente");
    expect(result?.error).toBeTruthy();
  });
});
