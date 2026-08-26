import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { uploadDocument, deleteDocument } from "./documents-actions";

beforeEach(resetDb);

function makeFormData(fields: { file?: File | null; description?: string }) {
  const fd = new FormData();
  if (fields.file) fd.set("file", fields.file);
  if (fields.description !== undefined) fd.set("description", fields.description);
  return fd;
}

describe("uploadDocument", () => {
  it("cria o documento com o conteúdo do arquivo", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    const file = new File(["conteúdo do contrato"], "contrato.txt", { type: "text/plain" });

    const result = await uploadDocument(
      undefined,
      makeFormData({ file, description: "Contrato de locação da unidade" })
    );

    expect(result).toBeUndefined();
    const documents = await testPrisma.document.findMany();
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      fileName: "contrato.txt",
      mimeType: "text/plain",
      description: "Contrato de locação da unidade",
    });
    expect(Buffer.from(documents[0].content).toString()).toBe("conteúdo do contrato");
  });

  it("recusa sem arquivo", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await uploadDocument(undefined, makeFormData({ description: "Algo" }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("recusa sem descrição", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    const file = new File(["x"], "arquivo.txt", { type: "text/plain" });

    const result = await uploadDocument(undefined, makeFormData({ file }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("recusa arquivo maior que o limite de 10MB", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    const bigContent = new Uint8Array(10 * 1024 * 1024 + 1);
    const file = new File([bigContent], "grande.bin", { type: "application/octet-stream" });

    const result = await uploadDocument(undefined, makeFormData({ file, description: "Muito grande" }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });
});

describe("deleteDocument", () => {
  it("exclui só o documento da própria empresa", async () => {
    const empresaA = await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const docDeA = await testPrisma.document.create({
      data: {
        companyId: empresaA.id,
        fileName: "a.txt",
        mimeType: "text/plain",
        size: 1,
        description: "Doc de A",
        content: Buffer.from("a"),
      },
    });
    const docDeB = await testPrisma.document.create({
      data: {
        companyId: empresaB.id,
        fileName: "b.txt",
        mimeType: "text/plain",
        size: 1,
        description: "Doc de B",
        content: Buffer.from("b"),
      },
    });

    // getActiveCompanyId() sem cookie cai na primeira empresa cadastrada (A).
    const result = await deleteDocument(docDeA.id);
    expect(result).toBeUndefined();
    await expect(testPrisma.document.findUnique({ where: { id: docDeA.id } })).resolves.toBeNull();

    const resultB = await deleteDocument(docDeB.id);
    expect(resultB?.error).toBeTruthy();
    await expect(testPrisma.document.findUnique({ where: { id: docDeB.id } })).resolves.not.toBeNull();
  });
});
