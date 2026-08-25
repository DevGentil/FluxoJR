import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { getPeriodBalanceReport } from "./balance-report";

beforeEach(resetDb);

const day = (s: string) => new Date(`${s}T12:00:00`);

describe("getPeriodBalanceReport", () => {
  it("calcula saldo inicial e final da conta nos limites exatos do período", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa Teste" } });
    const account = await testPrisma.account.create({
      data: { companyId: company.id, name: "Conta", type: "Caixa", initialBalance: 1000 },
    });

    await testPrisma.transaction.createMany({
      data: [
        // Antes do período: deve entrar no saldo inicial, não no faturamento.
        { companyId: company.id, accountId: account.id, type: "INCOME", amount: 500, description: "Antes", date: day("2026-08-01") },
        // Dentro do período.
        { companyId: company.id, accountId: account.id, type: "INCOME", amount: 300, description: "Dentro", date: day("2026-08-05") },
        { companyId: company.id, accountId: account.id, type: "EXPENSE", amount: 100, description: "Dentro", date: day("2026-08-06") },
        // Depois do período: não deve entrar em nada.
        { companyId: company.id, accountId: account.id, type: "INCOME", amount: 9999, description: "Depois", date: day("2026-08-20") },
      ],
    });

    const report = await getPeriodBalanceReport(
      [company.id],
      new Date("2026-08-03T00:00:00"),
      new Date("2026-08-08T23:59:59.999")
    );

    expect(report.accounts).toHaveLength(1);
    expect(report.accounts[0].opening).toBe(1500); // 1000 + 500 (antes)
    expect(report.accounts[0].closing).toBe(1700); // 1500 + 300 - 100
    expect(report.revenue).toBe(300);
    expect(report.expense).toBe(100);
    expect(report.netFlow).toBe(200);
  });

  it("rankeia categorias por total e calcula o % do total corretamente", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const account = await testPrisma.account.create({
      data: { companyId: company.id, name: "Conta", type: "Caixa", initialBalance: 0 },
    });
    const mp = await testPrisma.category.create({ data: { companyId: company.id, name: "Mercado Pago", type: "INCOME" } });
    const caixa = await testPrisma.category.create({ data: { companyId: company.id, name: "Sangria Caixa", type: "INCOME" } });

    await testPrisma.transaction.createMany({
      data: [
        { companyId: company.id, accountId: account.id, categoryId: mp.id, type: "INCOME", amount: 750, description: "MP", date: day("2026-08-05") },
        { companyId: company.id, accountId: account.id, categoryId: caixa.id, type: "INCOME", amount: 250, description: "Caixa", date: day("2026-08-05") },
      ],
    });

    const report = await getPeriodBalanceReport(
      [company.id],
      new Date("2026-08-01T00:00:00"),
      new Date("2026-08-10T23:59:59.999")
    );

    expect(report.revenueByCategory).toEqual([
      { categoryName: "Mercado Pago", total: 750, percent: 75 },
      { categoryName: "Sangria Caixa", total: 250, percent: 25 },
    ]);
  });

  it("exclui transferências entre empresas do faturamento/despesa, mas mantém no saldo da conta", async () => {
    const empresaA = await testPrisma.company.create({ data: { name: "Vespasiano" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Lagoa Santa" } });
    const contaA = await testPrisma.account.create({
      data: { companyId: empresaA.id, name: "Conta A", type: "Caixa", initialBalance: 1000 },
    });

    await testPrisma.transaction.createMany({
      data: [
        {
          companyId: empresaA.id,
          accountId: contaA.id,
          type: "EXPENSE",
          amount: 200,
          description: "Repasse para Lagoa Santa",
          date: day("2026-08-05"),
          transferCompanyId: empresaB.id,
        },
        {
          companyId: empresaA.id,
          accountId: contaA.id,
          type: "INCOME",
          amount: 500,
          description: "Venda normal",
          date: day("2026-08-06"),
        },
      ],
    });

    const report = await getPeriodBalanceReport(
      [empresaA.id],
      new Date("2026-08-01T00:00:00"),
      new Date("2026-08-10T23:59:59.999")
    );

    expect(report.revenue).toBe(500);
    expect(report.expense).toBe(0);
    expect(report.transfersOut).toBe(200);
    expect(report.transfersIn).toBe(0);
    // Saldo da conta continua refletindo a saída real do dinheiro.
    expect(report.accounts[0].closing).toBe(1300); // 1000 - 200 + 500
  });

  it("retorna vazio para uma lista de empresas vazia", async () => {
    const report = await getPeriodBalanceReport([], new Date("2026-08-01"), new Date("2026-08-10"));
    expect(report.revenue).toBe(0);
    expect(report.accounts).toEqual([]);
  });
});
