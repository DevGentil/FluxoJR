import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createTransaction, deleteTransaction, deleteTransactions, importTransactions } from "./actions";

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

describe("deleteTransactions", () => {
  it("exclui várias transações de uma vez", async () => {
    const { company, account } = await seedAccount();
    const [t1, t2, t3] = await Promise.all([
      testPrisma.transaction.create({
        data: { companyId: company.id, accountId: account.id, type: "INCOME", amount: 10, description: "a", date: new Date() },
      }),
      testPrisma.transaction.create({
        data: { companyId: company.id, accountId: account.id, type: "INCOME", amount: 20, description: "b", date: new Date() },
      }),
      testPrisma.transaction.create({
        data: { companyId: company.id, accountId: account.id, type: "INCOME", amount: 30, description: "c", date: new Date() },
      }),
    ]);

    const result = await deleteTransactions([t1.id, t2.id]);

    expect(result).toBeUndefined();
    await expect(testPrisma.transaction.findMany()).resolves.toHaveLength(1);
    await expect(testPrisma.transaction.findUnique({ where: { id: t3.id } })).resolves.not.toBeNull();
  });

  it("não exclui transações de outra empresa", async () => {
    // getActiveCompanyId() sem cookie cai na empresa mais antiga — criamos a "própria" primeiro
    // para garantir que a Empresa B não seja escolhida como padrão.
    await testPrisma.company.create({ data: { name: "Minha Empresa" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const contaDeB = await testPrisma.account.create({
      data: { companyId: empresaB.id, name: "Conta de B", type: "Caixa", initialBalance: 0 },
    });
    const transacaoDeB = await testPrisma.transaction.create({
      data: { companyId: empresaB.id, accountId: contaDeB.id, type: "INCOME", amount: 10, description: "x", date: new Date() },
    });

    const result = await deleteTransactions([transacaoDeB.id]);

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.transaction.findUnique({ where: { id: transacaoDeB.id } })).resolves.not.toBeNull();
  });

  it("rejeita uma lista vazia", async () => {
    const result = await deleteTransactions([]);
    expect(result?.error).toBeTruthy();
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
