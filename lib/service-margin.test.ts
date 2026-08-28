import { describe, expect, it } from "vitest";
import { computeMargin, taxPercentFor, type TaxBracketInput } from "./service-margin";

/** As faixas reais extraídas da planilha "Exames Contagem", calculando
 * Txs totais ÷ Valor Total em cada uma das 211 linhas. */
const BRACKETS: TaxBracketInput[] = [
  { minValue: 0, maxValue: 200, percent: 26.76 },
  { minValue: 200.01, maxValue: 400, percent: 29.65 },
  { minValue: 400.01, maxValue: 600, percent: 30.25 },
  { minValue: 600.01, maxValue: 990, percent: 38.81 },
  { minValue: 990.01, maxValue: null, percent: 37.3 },
];

describe("taxPercentFor", () => {
  it("aplica a faixa em que o valor cai", () => {
    expect(taxPercentFor(130, BRACKETS)).toBe(26.76);
    expect(taxPercentFor(390, BRACKETS)).toBe(29.65);
    expect(taxPercentFor(580, BRACKETS)).toBe(30.25);
    expect(taxPercentFor(680, BRACKETS)).toBe(38.81);
    expect(taxPercentFor(5400, BRACKETS)).toBe(37.3);
  });

  it("inclui os limites da faixa", () => {
    expect(taxPercentFor(200, BRACKETS)).toBe(26.76);
    expect(taxPercentFor(400, BRACKETS)).toBe(29.65);
  });

  it("usa a última faixa (sem teto) para valores altos", () => {
    expect(taxPercentFor(99999, BRACKETS)).toBe(37.3);
  });

  it("devolve 0 quando não há faixa cadastrada", () => {
    expect(taxPercentFor(500, [])).toBe(0);
  });
});

describe("computeMargin", () => {
  // Linhas reais da planilha, conferindo contra o "Lucro prev" que ela traz.
  it("reproduz o lucro da planilha em item lucrativo (Bioimpedanciometria)", () => {
    const m = computeMargin({ price: 130, doctorRate: 60, operationalCost: 4, brackets: BRACKETS })!;
    expect(m.tax).toBe(34.79);
    expect(m.profit).toBe(31.21);
  });

  it("reproduz o prejuízo da planilha (Ecoendoscopia Com Punção)", () => {
    const m = computeMargin({ price: 5400, doctorRate: 4600, operationalCost: 4, brackets: BRACKETS })!;
    expect(m.tax).toBe(2014.2);
    expect(m.profit).toBe(-1218.2);
  });

  it("reproduz o prejuízo do Botox", () => {
    const m = computeMargin({ price: 960, doctorRate: 760, operationalCost: 4, brackets: BRACKETS })!;
    expect(m.tax).toBe(372.58);
    expect(m.profit).toBe(-176.58);
  });

  it("calcula o percentual de margem e a fatia do médico", () => {
    const m = computeMargin({ price: 100, doctorRate: 50, operationalCost: 0, brackets: [] })!;
    expect(m.marginPercent).toBe(50);
    expect(m.doctorSharePercent).toBe(50);
  });

  it("o mesmo item pode dar lucro com um médico e prejuízo com outro", () => {
    const base = { price: 130, operationalCost: 4, brackets: BRACKETS };
    expect(computeMargin({ ...base, doctorRate: 60 })!.profit).toBeGreaterThan(0);
    expect(computeMargin({ ...base, doctorRate: 95 })!.profit).toBeLessThan(0);
  });

  it("não calcula margem de item sem preço (plantão, auxílio)", () => {
    expect(computeMargin({ price: null, doctorRate: 1800, operationalCost: 0, brackets: BRACKETS })).toBeNull();
    expect(computeMargin({ price: 0, doctorRate: 100, operationalCost: 0, brackets: BRACKETS })).toBeNull();
  });
});
