import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createSupplier, deleteSupplier, updateSupplier } from "./actions";

beforeEach(resetDb);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createSupplier", () => {
  it("cria o fornecedor com os dados opcionais", async () => {
    const result = await createSupplier(
      undefined,
      formData({ name: "DB Medicina Diagnóstica", document: "12.345.678/0001-90", phone: "3133334444" })
    );

    expect(result).toBeUndefined();
    const suppliers = await testPrisma.supplier.findMany();
    expect(suppliers).toMatchObject([
      { name: "DB Medicina Diagnóstica", document: "12.345.678/0001-90", phone: "3133334444", email: null },
    ]);
  });

  it("rejeita nome vazio", async () => {
    const result = await createSupplier(undefined, formData({ name: "" }));
    expect(result?.error).toBeTruthy();
  });
});

describe("updateSupplier / deleteSupplier", () => {
  it("atualiza e depois exclui o fornecedor", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const supplier = await testPrisma.supplier.create({
      data: { companyId: company.id, name: "Fornecedor X" },
    });

    const updateResult = await updateSupplier(supplier.id, undefined, formData({ name: "Fornecedor Y" }));
    expect(updateResult).toBeUndefined();
    await expect(testPrisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } })).resolves.toMatchObject({
      name: "Fornecedor Y",
    });

    const deleteResult = await deleteSupplier(supplier.id);
    expect(deleteResult).toBeUndefined();
    await expect(testPrisma.supplier.findUnique({ where: { id: supplier.id } })).resolves.toBeNull();
  });

  it("não permite editar fornecedor de outra empresa", async () => {
    await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const fornecedorDeB = await testPrisma.supplier.create({
      data: { companyId: empresaB.id, name: "Fornecedor de B" },
    });

    const result = await updateSupplier(fornecedorDeB.id, undefined, formData({ name: "Hackeado" }));

    expect(result?.error).toBeTruthy();
  });
});
