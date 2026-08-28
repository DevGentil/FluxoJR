import { describe, expect, it } from "vitest";
import { summarizePeriodLines, type PeriodLine } from "./doctor-period";
import type { TaxBracketInput } from "./service-margin";

const BRACKETS: TaxBracketInput[] = [
  { minValue: 0, maxValue: 200, percent: 26.76 },
  { minValue: 200.01, maxValue: null, percent: 29.65 },
];

function line(
  category: string,
  quantity: number,
  rate: number,
  price: number | null = null,
  operationalCost = 0
): PeriodLine {
  return { quantity, rate, serviceItem: { category, price, operationalCost } };
}

describe("summarizePeriodLines", () => {
  it("separa consulta, exame e plantão pela categoria do item", () => {
    const t = summarizePeriodLines(
      [line("CONSULTA", 40, 32), line("EXAME", 10, 5), line("PLANTAO", 8, 180)],
      BRACKETS
    );

    expect(t.consultationCount).toBe(40);
    expect(t.consultationValue).toBe(1280);
    expect(t.examCount).toBe(10);
    expect(t.examValue).toBe(50);
    expect(t.hoursWorked).toBe(8);
    expect(t.hourlyValue).toBe(1440);
    expect(t.totalValue).toBe(2770);
  });

  it("conta PROCEDIMENTO junto de EXAME na conversão", () => {
    const t = summarizePeriodLines([line("EXAME", 3, 10), line("PROCEDIMENTO", 2, 100)], BRACKETS);

    expect(t.examCount).toBe(5);
    expect(t.examValue).toBe(230);
  });

  it("aceita quantidade fracionada de plantão", () => {
    const t = summarizePeriodLines([line("PLANTAO", 40.5, 180)], BRACKETS);

    expect(t.hoursWorked).toBe(40.5);
    expect(t.hourlyValue).toBe(7290);
  });

  it("hoursWorked é null quando não há plantão", () => {
    expect(summarizePeriodLines([line("CONSULTA", 10, 32)], BRACKETS).hoursWorked).toBeNull();
  });

  describe("margem", () => {
    it("calcula receita, taxa e lucro do item com preço", () => {
      // 10 exames a R$130, repasse R$60, custo R$4, taxa 26,76% => R$34,79
      const t = summarizePeriodLines([line("EXAME", 10, 60, 130, 4)], BRACKETS);

      expect(t.revenue).toBe(1300);
      expect(t.tax).toBeCloseTo(347.9, 2);
      expect(t.operationalCost).toBe(40);
      expect(t.profit).toBeCloseTo(312.1, 2); // 10 x 31,21 da planilha
      expect(t.unpricedCost).toBe(0);
    });

    it("item sem preço fica fora dos DOIS lados da margem", () => {
      // O plantão custa R$1.440 mas não tem preço: não pode entrar no custo
      // da margem, senão a conta compararia a receita do exame com o custo
      // do exame MAIS o do plantão.
      const t = summarizePeriodLines([line("EXAME", 10, 60, 130, 4), line("PLANTAO", 8, 180)], BRACKETS);

      expect(t.revenue).toBe(1300);
      expect(t.unpricedCost).toBe(1440);
      expect(t.profit).toBeCloseTo(312.1, 2); // igual ao caso sem plantão
      expect(t.totalValue).toBe(2040); // mas o repasse total inclui o plantão
    });

    it("acusa prejuízo quando o repasse passa do que sobra", () => {
      // Ultrassom real: cobra 87, taxa 26,76% (23,28), custo 25 => sobram
      // 38,72. Um repasse de 45 estoura o teto.
      const t = summarizePeriodLines([line("EXAME", 1, 45, 87, 25)], BRACKETS);

      expect(t.profit).toBeCloseTo(-6.28, 2);
    });

    it("o mesmo item dá lucro com um médico e prejuízo com outro", () => {
      const barato = summarizePeriodLines([line("EXAME", 1, 30, 87, 25)], BRACKETS);
      const caro = summarizePeriodLines([line("EXAME", 1, 45, 87, 25)], BRACKETS);

      expect(barato.profit).toBeGreaterThan(0);
      expect(caro.profit).toBeLessThan(0);
    });

    it("sem nenhuma linha com preço não há receita nem margem", () => {
      const t = summarizePeriodLines([line("CONSULTA", 40, 32), line("PLANTAO", 8, 180)], BRACKETS);

      expect(t.revenue).toBe(0);
      expect(t.profit).toBe(0);
      expect(t.unpricedCost).toBe(2720);
    });
  });
});
