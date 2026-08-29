import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createTaxBracket, updateTaxBracket, deleteTaxBracket } from "./tax-brackets-actions";

beforeEach(resetDb);

/** As faixas são editadas por um <form>, então a action recebe FormData —
 * é assim que ela é chamada de verdade. */
function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const faixaBase = { minValue: "0", maxValue: "200", percent: "26.76", notes: "Até R$200" };

describe("createTaxBracket", () => {
  it("cria a faixa com os percentuais reais da planilha", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createTaxBracket(undefined, form(faixaBase));

    expect(result?.error).toBeUndefined();
    const faixa = await testPrisma.taxBracket.findFirstOrThrow();
    expect(Number(faixa.minValue)).toBe(0);
    expect(Number(faixa.maxValue)).toBe(200);
    expect(Number(faixa.percent)).toBe(26.76);
    expect(faixa.notes).toBe("Até R$200");
  });

  it("aceita faixa aberta no topo — o 'ou mais' da última", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createTaxBracket(
      undefined,
      form({ minValue: "990.01", maxValue: "", percent: "37.3", notes: "" })
    );

    expect(result?.error).toBeUndefined();
    const faixa = await testPrisma.taxBracket.findFirstOrThrow();
    expect(faixa.maxValue).toBeNull();
    expect(faixa.notes).toBeNull();
  });

  it("recusa faixa invertida, com o máximo abaixo do mínimo", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createTaxBracket(
      undefined,
      form({ minValue: "400", maxValue: "200", percent: "30", notes: "" })
    );

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.taxBracket.count()).resolves.toBe(0);
  });

  it("recusa percentual em branco", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createTaxBracket(
      undefined,
      form({ minValue: "0", maxValue: "200", percent: "", notes: "" })
    );

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.taxBracket.count()).resolves.toBe(0);
  });
});

describe("updateTaxBracket", () => {
  it("altera o percentual da faixa", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    await createTaxBracket(undefined, form(faixaBase));
    const faixa = await testPrisma.taxBracket.findFirstOrThrow();

    const result = await updateTaxBracket(faixa.id, undefined, form({ ...faixaBase, percent: "28.5" }));

    expect(result?.error).toBeUndefined();
    const atualizada = await testPrisma.taxBracket.findFirstOrThrow();
    expect(Number(atualizada.percent)).toBe(28.5);
  });

  it("não alcança faixa de outra empresa", async () => {
    // getActiveCompanyId() cai na empresa mais antiga; a faixa é da outra.
    await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const faixaB = await testPrisma.taxBracket.create({
      data: { companyId: empresaB.id, minValue: 0, maxValue: 200, percent: 10 },
    });

    const result = await updateTaxBracket(faixaB.id, undefined, form({ ...faixaBase, percent: "99" }));

    expect(result?.error).toBeTruthy();
    const intacta = await testPrisma.taxBracket.findUniqueOrThrow({ where: { id: faixaB.id } });
    expect(Number(intacta.percent)).toBe(10);
  });
});

describe("deleteTaxBracket", () => {
  it("exclui a faixa", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    await createTaxBracket(undefined, form(faixaBase));
    const faixa = await testPrisma.taxBracket.findFirstOrThrow();

    const result = await deleteTaxBracket(faixa.id);

    expect(result?.error).toBeUndefined();
    await expect(testPrisma.taxBracket.count()).resolves.toBe(0);
  });
});
