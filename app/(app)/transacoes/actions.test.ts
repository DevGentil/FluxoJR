import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createTransaction, deleteTransaction, importTransactions } from "./actions";

beforeEach(resetDb);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function seedAccount() {
  const company = await testPrisma.company.create({ data: { name: "Empresa" } });
  const account = await testPrisma.account.create({
    data: { companyId: company.id, name: "Conta", type: "Caixa", initialBalance: 0 },
  });
  return { company, account };
}

describe("createTransaction", () => {
  it("cria uma transação manual válida", async () => {
    const { account } = await seedAccount();

    const result = await createTransaction(
      undefined,
      formData({
        date: "2026-08-24",
        amount: "150.50",
        type: "EXPENSE",
        description: "Compra de material",
        accountId: account.id,
      })
    );

    expect(result).toBeUndefined();
    const transactions = await testPrisma.transaction.findMany();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ description: "Compra de material", source: "MANUAL" });
  });

  it("rejeita valor zero ou negativo", async () => {
    const { account } = await seedAccount();
    const result = await createTransaction(
      undefined,
      formData({ date: "2026-08-24", amount: "0", type: "EXPENSE", description: "x", accountId: account.id })
    );
    expect(result?.error).toBeTruthy();
  });

  it("rejeita quando nenhuma conta é informada", async () => {
    await seedAccount();
    const result = await createTransaction(
      undefined,
      formData({ date: "2026-08-24", amount: "10", type: "EXPENSE", description: "x", accountId: "" })
    );
    expect(result?.error).toBeTruthy();
  });
});

describe("deleteTransaction", () => {
  it("exclui a transação", async () => {
    const { company, account } = await seedAccount();
    const transaction = await testPrisma.transaction.create({
      data: { companyId: company.id, accountId: account.id, type: "INCOME", amount: 10, description: "x", date: new Date() },
    });

    const result = await deleteTransaction(transaction.id);

    expect(result).toBeUndefined();
    await expect(testPrisma.transaction.findUnique({ where: { id: transaction.id } })).resolves.toBeNull();
  });
});

describe("importTransactions", () => {
  it("importa em lote e cria o ImportBatch correspondente", async () => {
    const { account } = await seedAccount();

    const result = await importTransactions({
      fileName: "extrato.csv",
      accountId: account.id,
      rows: [
        { date: "2026-08-01", amount: 100, type: "INCOME", description: "Venda 1" },
        { date: "2026-08-02", amount: 50, type: "EXPENSE", description: "Compra 1" },
      ],
    });

    expect(result.imported).toBe(2);
    const transactions = await testPrisma.transaction.findMany({ orderBy: { date: "asc" } });
    expect(transactions).toHaveLength(2);
    expect(transactions.every((t) => t.source === "IMPORT")).toBe(true);

    const batches = await testPrisma.importBatch.findMany();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ fileName: "extrato.csv", rowsImported: 2 });
  });

  it("rejeita quando a conta não pertence à empresa", async () => {
    await seedAccount();
    await expect(
      importTransactions({
        fileName: "extrato.csv",
        accountId: "conta-inexistente",
        rows: [{ date: "2026-08-01", amount: 100, type: "INCOME", description: "Venda" }],
      })
    ).rejects.toThrow();
  });
});
