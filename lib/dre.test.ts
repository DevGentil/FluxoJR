import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { montarDre, limitesDoMes } from "./dre";
import { parseDateOnly } from "@/lib/date-only";

beforeEach(resetDb);

async function cenario() {
  const empresa = await testPrisma.company.create({ data: { name: "AS Laguna" } });
  const conta = await testPrisma.account.create({
    data: { companyId: empresa.id, name: "Caixa", type: "CASH" },
  });
  const consultas = await testPrisma.category.create({
    data: { companyId: empresa.id, name: "Consultas", type: "INCOME" },
  });
  const exames = await testPrisma.category.create({
    data: { companyId: empresa.id, name: "Exames", type: "INCOME" },
  });
  // Duas despesas sob o MESMO centro de custo, para provar que o agrupamento
  // é por classificação e não por centro.
  const software = await testPrisma.category.create({
    data: { companyId: empresa.id, name: "Software", type: "EXPENSE", costCenter: "Administrativas" },
  });
  const aluguel = await testPrisma.category.create({
    data: { companyId: empresa.id, name: "Aluguel", type: "EXPENSE", costCenter: "Administrativas" },
  });
  const fornecedor = await testPrisma.supplier.create({
    data: { companyId: empresa.id, name: "Sistemas Ltda" },
  });
  return { empresa, conta, consultas, exames, software, aluguel, fornecedor };
}

function lancar(
  companyId: string,
  accountId: string,
  categoryId: string | null,
  type: "INCOME" | "EXPENSE",
  amount: number,
  dia: string,
  extra: Record<string, unknown> = {}
) {
  return testPrisma.transaction.create({
    data: {
      companyId,
      accountId,
      categoryId,
      type,
      amount,
      description: `${type} ${dia}`,
      date: parseDateOnly(dia),
      ...extra,
    },
  });
}

describe("limites do mês", () => {
  it("cobre o mês inteiro, do dia 1 ao último", () => {
    const p = limitesDoMes("2026-02")!;
    expect(p.inicio.toISOString().slice(0, 10)).toBe("2026-02-01");
    // 2026 não é bissexto: fevereiro fecha em 28.
    expect(p.fim.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("recusa competência inválida", () => {
    expect(limitesDoMes("2026-13")).toBeNull();
    expect(limitesDoMes("agosto")).toBeNull();
    expect(limitesDoMes("2026-8")).toBeNull();
  });
});

describe("o DRE da competência", () => {
  it("abre com o faturamento por tipo, do maior para o menor", async () => {
    const c = await cenario();
    await lancar(c.empresa.id, c.conta.id, c.consultas.id, "INCOME", 1000, "2026-07-05");
    await lancar(c.empresa.id, c.conta.id, c.exames.id, "INCOME", 2500, "2026-07-10");
    await lancar(c.empresa.id, c.conta.id, c.consultas.id, "INCOME", 500, "2026-07-20");

    const dre = await montarDre([c.empresa.id], "2026-07");

    expect(dre.faturamento).toEqual([
      { rotulo: "Exames", valor: 2500 },
      { rotulo: "Consultas", valor: 1500 },
    ]);
    expect(dre.receitaTotal).toBe(4000);
  });

  it("agrupa despesa por classificação, em ordem alfabética", async () => {
    const c = await cenario();
    await lancar(c.empresa.id, c.conta.id, c.software.id, "EXPENSE", 300, "2026-07-02");
    await lancar(c.empresa.id, c.conta.id, c.aluguel.id, "EXPENSE", 5000, "2026-07-01");
    await lancar(c.empresa.id, c.conta.id, c.software.id, "EXPENSE", 200, "2026-07-15");

    const dre = await montarDre([c.empresa.id], "2026-07");

    // Alfabética, e não por valor: é o que permite comparar dois meses lado a
    // lado sem procurar onde cada rubrica foi parar.
    expect(dre.grupos.map((g) => g.classificacao)).toEqual(["Aluguel", "Software"]);
    const sw = dre.grupos.find((g) => g.classificacao === "Software")!;
    expect(sw.lancamentos).toHaveLength(2);
    expect(sw.total).toBe(500);
    expect(sw.categoriaFinanceira).toBe("Administrativas");
  });

  it("o resultado é receita menos despesa", async () => {
    const c = await cenario();
    await lancar(c.empresa.id, c.conta.id, c.consultas.id, "INCOME", 10000, "2026-07-05");
    await lancar(c.empresa.id, c.conta.id, c.aluguel.id, "EXPENSE", 4000, "2026-07-01");

    const dre = await montarDre([c.empresa.id], "2026-07");
    expect(dre.resultado).toBe(6000);
  });

  it("prejuízo vem negativo, não em módulo", async () => {
    const c = await cenario();
    await lancar(c.empresa.id, c.conta.id, c.consultas.id, "INCOME", 1000, "2026-07-05");
    await lancar(c.empresa.id, c.conta.id, c.aluguel.id, "EXPENSE", 4000, "2026-07-01");

    expect((await montarDre([c.empresa.id], "2026-07")).resultado).toBe(-3000);
  });

  it("não deixa entrar lançamento de outra competência", async () => {
    const c = await cenario();
    await lancar(c.empresa.id, c.conta.id, c.consultas.id, "INCOME", 1000, "2026-07-31");
    await lancar(c.empresa.id, c.conta.id, c.consultas.id, "INCOME", 999, "2026-08-01");
    await lancar(c.empresa.id, c.conta.id, c.consultas.id, "INCOME", 777, "2026-06-30");

    const dre = await montarDre([c.empresa.id], "2026-07");
    expect(dre.receitaTotal).toBe(1000);
    expect(dre.quantidade).toBe(1);
  });

  it("transferência entre empresas do grupo não é faturamento nem despesa", async () => {
    const c = await cenario();
    const outra = await testPrisma.company.create({ data: { name: "AS Contagem" } });
    await lancar(c.empresa.id, c.conta.id, c.consultas.id, "INCOME", 1000, "2026-07-05");
    // O dinheiro só mudou de bolso dentro da mesma casa.
    await lancar(c.empresa.id, c.conta.id, null, "INCOME", 50000, "2026-07-06", {
      transferCompanyId: outra.id,
    });

    const dre = await montarDre([c.empresa.id], "2026-07");
    expect(dre.receitaTotal).toBe(1000);
  });

  it("lançamento sem categoria não some — vai para um balde nomeado", async () => {
    const c = await cenario();
    await lancar(c.empresa.id, c.conta.id, null, "EXPENSE", 250, "2026-07-09");

    const dre = await montarDre([c.empresa.id], "2026-07");
    expect(dre.grupos).toHaveLength(1);
    expect(dre.grupos[0].classificacao).toBe("Sem classificação");
    expect(dre.grupos[0].categoriaFinanceira).toBe("A classificar");
    expect(dre.despesaTotal).toBe(250);
  });

  it("competência sem movimento devolve zeros, não erro", async () => {
    const c = await cenario();
    const dre = await montarDre([c.empresa.id], "2026-07");

    expect(dre.receitaTotal).toBe(0);
    expect(dre.despesaTotal).toBe(0);
    expect(dre.resultado).toBe(0);
    expect(dre.grupos).toEqual([]);
  });

  it("sem empresa no escopo não consulta nada", async () => {
    expect((await montarDre([], "2026-07")).quantidade).toBe(0);
  });
});
