import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createCategory, deleteCategory, updateCategory } from "./actions";

beforeEach(resetDb);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createCategory", () => {
  it("cria a categoria com tipo e centro de custo", async () => {
    const result = await createCategory(
      undefined,
      formData({ name: "Aluguel", type: "EXPENSE", costCenter: "Administrativo" })
    );

    expect(result).toBeUndefined();
    const categories = await testPrisma.category.findMany();
    expect(categories).toMatchObject([{ name: "Aluguel", type: "EXPENSE", costCenter: "Administrativo" }]);
  });

  it("rejeita um tipo inválido", async () => {
    const result = await createCategory(undefined, formData({ name: "Aluguel", type: "INVALIDO" }));
    expect(result?.error).toBeTruthy();
  });
});

describe("updateCategory / deleteCategory", () => {
  it("atualiza e depois exclui a categoria", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const category = await testPrisma.category.create({
      data: { companyId: company.id, name: "Vendas", type: "INCOME" },
    });

    const updateResult = await updateCategory(
      category.id,
      undefined,
      formData({ name: "Vendas Online", type: "INCOME" })
    );
    expect(updateResult).toBeUndefined();
    await expect(testPrisma.category.findUniqueOrThrow({ where: { id: category.id } })).resolves.toMatchObject({
      name: "Vendas Online",
    });

    const deleteResult = await deleteCategory(category.id);
    expect(deleteResult).toBeUndefined();
    await expect(testPrisma.category.findUnique({ where: { id: category.id } })).resolves.toBeNull();
  });

  it("não permite editar categoria de outra empresa", async () => {
    await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const categoriaDeB = await testPrisma.category.create({
      data: { companyId: empresaB.id, name: "Categoria de B", type: "EXPENSE" },
    });

    const result = await updateCategory(
      categoriaDeB.id,
      undefined,
      formData({ name: "Hackeado", type: "EXPENSE" })
    );

    expect(result?.error).toBeTruthy();
  });
});
