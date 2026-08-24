import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createScheduledEntry, markAsPaid } from "./actions";

beforeEach(resetDb);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function seedAccount(initialBalance = 0) {
  const company = await testPrisma.company.create({ data: { name: "Empresa" } });
  const account = await testPrisma.account.create({
    data: { companyId: company.id, name: "Conta", type: "Caixa", initialBalance },
  });
  return { company, account };
}

describe("createScheduledEntry", () => {
  it("cria um lançamento a pagar sem conta definida (definida só na baixa)", async () => {
    await seedAccount();

    const result = await createScheduledEntry(
      undefined,
      formData({
        type: "PAYABLE",
        description: "Aluguel",
        amount: "1500",
        dueDate: "2026-09-05",
        accountId: "__none__",
        categoryId: "__none__",
      })
    );

    expect(result).toBeUndefined();
    const entries = await testPrisma.scheduledEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "PAYABLE", status: "PENDING", accountId: null });
  });
});

describe("markAsPaid", () => {
  it("cria a transação vinculada e atualiza o status para PAID", async () => {
    const { company, account } = await seedAccount(1000);
    const entry = await testPrisma.scheduledEntry.create({
      data: { companyId: company.id, type: "PAYABLE", description: "Aluguel", amount: 300, dueDate: new Date(), status: "PENDING" },
    });

    const result = await markAsPaid(entry.id, account.id);

    expect(result).toBeUndefined();

    const updatedEntry = await testPrisma.scheduledEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updatedEntry.status).toBe("PAID");
    expect(updatedEntry.accountId).toBe(account.id);
    expect(updatedEntry.transactionId).not.toBeNull();
    expect(updatedEntry.paidDate).not.toBeNull();

    const transaction = await testPrisma.transaction.findUniqueOrThrow({
      where: { id: updatedEntry.transactionId! },
    });
    expect(transaction).toMatchObject({
      type: "EXPENSE",
      description: "Aluguel",
      accountId: account.id,
      source: "SCHEDULED",
    });
    expect(Number(transaction.amount)).toBe(300);
  });

  it("cria uma transação de tipo INCOME para contas a receber", async () => {
    const { company, account } = await seedAccount();
    const entry = await testPrisma.scheduledEntry.create({
      data: { companyId: company.id, type: "RECEIVABLE", description: "Consultoria", amount: 800, dueDate: new Date(), status: "PENDING" },
    });

    await markAsPaid(entry.id, account.id);

    const transaction = await testPrisma.transaction.findFirstOrThrow({ where: { description: "Consultoria" } });
    expect(transaction.type).toBe("INCOME");
  });

  it("recusa baixar um lançamento já pago", async () => {
    const { company, account } = await seedAccount();
    const entry = await testPrisma.scheduledEntry.create({
      data: {
        companyId: company.id,
        type: "PAYABLE",
        description: "Já pago",
        amount: 100,
        dueDate: new Date(),
        status: "PAID",
        paidDate: new Date(),
      },
    });

    const result = await markAsPaid(entry.id, account.id);
    expect(result?.error).toBeTruthy();
  });

  it("recusa baixar usando uma conta de outra empresa", async () => {
    const { company } = await seedAccount();
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const contaDeB = await testPrisma.account.create({
      data: { companyId: empresaB.id, name: "Conta de B", type: "Caixa", initialBalance: 0 },
    });
    const entry = await testPrisma.scheduledEntry.create({
      data: { companyId: company.id, type: "PAYABLE", description: "Aluguel", amount: 100, dueDate: new Date(), status: "PENDING" },
    });

    const result = await markAsPaid(entry.id, contaDeB.id);
    expect(result?.error).toBeTruthy();
    await expect(testPrisma.scheduledEntry.findUniqueOrThrow({ where: { id: entry.id } })).resolves.toMatchObject({
      status: "PENDING",
    });
  });
});
