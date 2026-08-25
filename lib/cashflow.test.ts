import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { getAccountBalance, getBalanceProjection, getConsolidatedBalance } from "./cashflow";

beforeEach(resetDb);

async function seedCompanyWithAccount(initialBalance: number) {
  const company = await testPrisma.company.create({ data: { name: "Empresa Teste" } });
  const account = await testPrisma.account.create({
    data: { companyId: company.id, name: "Conta Teste", type: "Conta Corrente", initialBalance },
  });
  return { company, account };
}

describe("getAccountBalance", () => {
  it("retorna o saldo inicial quando não há transações", async () => {
    const { account } = await seedCompanyWithAccount(1000);
    await expect(getAccountBalance(account.id)).resolves.toBe(1000);
  });

  it("soma entradas e subtrai saídas do saldo inicial", async () => {
    const { company, account } = await seedCompanyWithAccount(1000);
    await testPrisma.transaction.createMany({
      data: [
        { companyId: company.id, accountId: account.id, type: "INCOME", amount: 500, description: "Venda", date: new Date() },
        { companyId: company.id, accountId: account.id, type: "EXPENSE", amount: 200, description: "Conta", date: new Date() },
      ],
    });

    await expect(getAccountBalance(account.id)).resolves.toBe(1300);
  });
});

describe("getConsolidatedBalance", () => {
  it("soma o saldo de todas as contas da empresa", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa Teste" } });
    const contaA = await testPrisma.account.create({
      data: { companyId: company.id, name: "Conta A", type: "Caixa", initialBalance: 100 },
    });
    await testPrisma.account.create({
      data: { companyId: company.id, name: "Conta B", type: "Caixa", initialBalance: 200 },
    });
    await testPrisma.transaction.create({
      data: { companyId: company.id, accountId: contaA.id, type: "INCOME", amount: 50, description: "Venda", date: new Date() },
    });

    await expect(getConsolidatedBalance([company.id])).resolves.toBe(350);
  });

  it("não mistura o saldo de empresas diferentes quando pedido isoladamente", async () => {
    const empresaA = await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    await testPrisma.account.create({ data: { companyId: empresaA.id, name: "Conta A", type: "Caixa", initialBalance: 1000 } });
    await testPrisma.account.create({ data: { companyId: empresaB.id, name: "Conta B", type: "Caixa", initialBalance: 5000 } });

    await expect(getConsolidatedBalance([empresaA.id])).resolves.toBe(1000);
    await expect(getConsolidatedBalance([empresaB.id])).resolves.toBe(5000);
  });

  it("soma o saldo de várias empresas quando o escopo é um grupo/holding", async () => {
    const grupo = await testPrisma.group.create({ data: { name: "AmorSaude" } });
    const empresaA = await testPrisma.company.create({ data: { name: "AS Laguna", groupId: grupo.id } });
    const empresaB = await testPrisma.company.create({ data: { name: "AS Contagem", groupId: grupo.id } });
    await testPrisma.account.create({ data: { companyId: empresaA.id, name: "Conta A", type: "Caixa", initialBalance: 1000 } });
    await testPrisma.account.create({ data: { companyId: empresaB.id, name: "Conta B", type: "Caixa", initialBalance: 500 } });

    await expect(getConsolidatedBalance([empresaA.id, empresaB.id])).resolves.toBe(1500);
  });

  it("retorna 0 para uma lista vazia de empresas", async () => {
    await expect(getConsolidatedBalance([])).resolves.toBe(0);
  });
});

describe("getBalanceProjection", () => {
  it("projeta o saldo somando contas a pagar/receber pendentes dentro do horizonte", async () => {
    const { company } = await seedCompanyWithAccount(1000);
    const today = new Date();
    const in10Days = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);
    const in100Days = new Date(today.getTime() + 100 * 24 * 60 * 60 * 1000);

    await testPrisma.scheduledEntry.createMany({
      data: [
        { companyId: company.id, type: "RECEIVABLE", description: "A receber", amount: 300, dueDate: in10Days, status: "PENDING" },
        { companyId: company.id, type: "PAYABLE", description: "A pagar", amount: 100, dueDate: in10Days, status: "PENDING" },
        // Fora do horizonte de 30 dias — não deve entrar na projeção.
        { companyId: company.id, type: "RECEIVABLE", description: "Fora do prazo", amount: 9999, dueDate: in100Days, status: "PENDING" },
        // Já pago — não deve ser somado de novo.
        { companyId: company.id, type: "RECEIVABLE", description: "Já pago", amount: 500, dueDate: in10Days, status: "PAID" },
      ],
    });

    const result = await getBalanceProjection([company.id], 30);

    expect(result.currentBalance).toBe(1000);
    expect(result.projectedBalance).toBe(1200); // 1000 + 300 - 100
  });
});
