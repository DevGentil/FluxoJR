import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import {
  getAccountBalance,
  getBalanceProjection,
  getConsolidatedBalance,
  getMonthlySummary,
} from "./cashflow";
import { addDays, addMonths, currentMonthKey, parseDateOnly, todayDateOnly } from "./date-only";
import { formatDate } from "./format";

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

describe("getMonthlySummary", () => {
  it("põe o lançamento do dia 1º no mês certo", async () => {
    // A regressão que isso trava: a data é gravada na meia-noite UTC, e ler
    // o mês dela com getMonth() (relógio local, UTC-3) devolvia o mês
    // ANTERIOR — todo dia 1º caía no balde errado do gráfico do dashboard.
    const { company, account } = await seedCompanyWithAccount(0);
    const mesAtual = currentMonthKey();

    await testPrisma.transaction.create({
      data: {
        companyId: company.id,
        accountId: account.id,
        type: "INCOME",
        amount: 1000,
        description: "Venda do dia 1º",
        date: parseDateOnly(`${mesAtual}-01`),
      },
    });

    const meses = await getMonthlySummary([company.id], 6);
    const atual = meses.find((m) => m.key === mesAtual);
    const anterior = meses.find((m) => m.key === addMonths(mesAtual, -1));

    expect(atual?.income).toBe(1000);
    expect(anterior?.income).toBe(0);
  });

  it("inclui o dia 1º do mês mais antigo da janela", async () => {
    // O limite `gte` também era montado em hora local, o que empurrava a
    // borda para as 03h UTC e excluía o próprio dia 1º.
    const { company, account } = await seedCompanyWithAccount(0);
    const primeiroMes = addMonths(currentMonthKey(), -5);

    await testPrisma.transaction.create({
      data: {
        companyId: company.id,
        accountId: account.id,
        type: "EXPENSE",
        amount: 250,
        description: "Aluguel",
        date: parseDateOnly(`${primeiroMes}-01`),
      },
    });

    const meses = await getMonthlySummary([company.id], 6);
    expect(meses.find((m) => m.key === primeiroMes)?.expense).toBe(250);
  });

  it("ignora transferência entre empresas do grupo", async () => {
    const { company, account } = await seedCompanyWithAccount(0);
    const outra = await testPrisma.company.create({ data: { name: "Outra" } });

    await testPrisma.transaction.create({
      data: {
        companyId: company.id,
        accountId: account.id,
        type: "INCOME",
        amount: 700,
        description: "Aporte da matriz",
        date: parseDateOnly(`${currentMonthKey()}-15`),
        transferCompanyId: outra.id,
      },
    });

    const meses = await getMonthlySummary([company.id], 6);
    expect(meses.find((m) => m.key === currentMonthKey())?.income).toBe(0);
  });
});

describe("getBalanceProjection — o que já venceu", () => {
  async function seedVencidoEFuturo() {
    const { company } = await seedCompanyWithAccount(1000);
    const hoje = todayDateOnly();
    await testPrisma.scheduledEntry.createMany({
      data: [
        // Venceu e não foi pago: continua devido.
        {
          companyId: company.id,
          type: "PAYABLE",
          description: "Boleto atrasado",
          amount: 200,
          dueDate: parseDateOnly(addDays(hoje, -40)),
          status: "OVERDUE",
        },
        {
          companyId: company.id,
          type: "RECEIVABLE",
          description: "A receber daqui a 10 dias",
          amount: 300,
          dueDate: parseDateOnly(addDays(hoje, 10)),
          status: "PENDING",
        },
      ],
    });
    return company;
  }

  it("mantém a linha do tempo andando só para frente", async () => {
    // Antes, o vencido virava um ponto na data passada em que venceu, e o
    // eixo do gráfico ia de "Hoje" para trás antes de ir para frente.
    const company = await seedVencidoEFuturo();
    const { points } = await getBalanceProjection([company.id], 30);

    expect(points.map((p) => p.label)).toEqual(["Hoje", "Vencido", formatDate(parseDateOnly(addDays(todayDateOnly(), 10)))]);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].date >= points[i - 1].date).toBe(true);
    }
  });

  it("não mexe no saldo de hoje, mas soma o vencido no total projetado", async () => {
    const company = await seedVencidoEFuturo();
    const result = await getBalanceProjection([company.id], 30);

    expect(result.currentBalance).toBe(1000); // saldo real em conta
    expect(result.overdue).toBe(-200);
    expect(result.points[1].balance).toBe(800); // degrau do vencido
    expect(result.projectedBalance).toBe(1100); // 1000 - 200 + 300
  });

  it("sem nada vencido, não inventa o degrau", async () => {
    const { company } = await seedCompanyWithAccount(500);
    await testPrisma.scheduledEntry.create({
      data: {
        companyId: company.id,
        type: "RECEIVABLE",
        description: "A receber",
        amount: 100,
        dueDate: parseDateOnly(addDays(todayDateOnly(), 5)),
        status: "PENDING",
      },
    });

    const { points, overdue } = await getBalanceProjection([company.id], 30);
    expect(overdue).toBe(0);
    expect(points.map((p) => p.label)).not.toContain("Vencido");
  });

  it("junta num degrau só vários vencimentos no mesmo dia", async () => {
    const { company } = await seedCompanyWithAccount(0);
    const dia = parseDateOnly(addDays(todayDateOnly(), 7));
    await testPrisma.scheduledEntry.createMany({
      data: [1, 2, 3].map((n) => ({
        companyId: company.id,
        type: "PAYABLE" as const,
        description: `Boleto ${n}`,
        amount: 100,
        dueDate: dia,
        status: "PENDING" as const,
      })),
    });

    const { points } = await getBalanceProjection([company.id], 30);
    expect(points).toHaveLength(2); // "Hoje" + um único degrau
    expect(points[1].balance).toBe(-300);
  });
});
