import { describe, expect, it } from "vitest";
import { summarizeDailyEntries, entryAmount, type DailyEntry, type PeriodLine } from "./doctor-period";
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

/** Lançamento sem detalhe — o formato de 98% das planilhas reais. */
const valor = (amount: number): DailyEntry => ({ amount, lines: [] });
/** Lançamento detalhado por item. */
const detalhado = (...lines: PeriodLine[]): DailyEntry => ({ amount: null, lines });

describe("entryAmount", () => {
  it("usa o valor digitado quando não há detalhe", () => {
    expect(entryAmount(valor(332))).toBe(332);
  });

  it("soma as linhas quando há detalhe", () => {
    // 8 consultas CT a 24 + 2 ECG a 10 = 212, a mesma conta da planilha
    expect(entryAmount(detalhado(line("CONSULTA", 8, 24), line("EXAME", 2, 10)))).toBe(212);
  });

  it("reproduz o plantão por hora do Bruno Alencar", () => {
    // 9,5h a R$180 = R$1.710, valor que está na planilha dele
    expect(entryAmount(detalhado(line("PLANTAO", 9.5, 180)))).toBe(1710);
  });
});

describe("summarizeDailyEntries", () => {
  it("separa consulta, exame e plantão pela categoria do item", () => {
    const t = summarizeDailyEntries(
      [detalhado(line("CONSULTA", 40, 32), line("EXAME", 10, 5), line("PLANTAO", 8, 180))],
      BRACKETS
    );

    expect(t.consultationCount).toBe(40);
    expect(t.consultationValue).toBe(1280);
    expect(t.examCount).toBe(10);
    expect(t.hoursWorked).toBe(8);
    expect(t.hourlyValue).toBe(1440);
    expect(t.totalValue).toBe(2770);
  });

  it("conta PROCEDIMENTO junto de EXAME na conversão", () => {
    const t = summarizeDailyEntries([detalhado(line("EXAME", 3, 10), line("PROCEDIMENTO", 2, 100))], BRACKETS);
    expect(t.examCount).toBe(5);
  });

  it("soma vários dias num único total", () => {
    const t = summarizeDailyEntries(
      [detalhado(line("CONSULTA", 10, 30)), detalhado(line("CONSULTA", 5, 30))],
      BRACKETS
    );
    expect(t.consultationCount).toBe(15);
    expect(t.totalValue).toBe(450);
  });

  describe("lançamento sem detalhe (o formato das planilhas)", () => {
    it("entra no custo mas fica fora das contagens", () => {
      const t = summarizeDailyEntries([valor(332), valor(342)], BRACKETS);

      expect(t.totalValue).toBe(674);
      expect(t.undetailedValue).toBe(674);
      // Nao da pra saber o que foi feito, entao nao conta consulta nem exame
      expect(t.consultationCount).toBe(0);
      expect(t.examCount).toBe(0);
      expect(t.revenue).toBe(0);
    });

    it("convive com lançamentos detalhados no mesmo período", () => {
      const t = summarizeDailyEntries([valor(332), detalhado(line("CONSULTA", 10, 30))], BRACKETS);

      expect(t.totalValue).toBe(632);
      expect(t.undetailedValue).toBe(332);
      expect(t.consultationCount).toBe(10);
    });
  });

  describe("margem", () => {
    it("calcula receita, taxa e lucro do item com preço", () => {
      // 10 exames a R$130, repasse R$60, custo R$4, taxa 26,76% => R$34,79
      const t = summarizeDailyEntries([detalhado(line("EXAME", 10, 60, 130, 4))], BRACKETS);

      expect(t.revenue).toBe(1300);
      expect(t.tax).toBeCloseTo(347.9, 2);
      expect(t.profit).toBeCloseTo(312.1, 2); // 10 x 31,21 da planilha
    });

    it("item sem preço fica fora dos DOIS lados da margem", () => {
      const t = summarizeDailyEntries(
        [detalhado(line("EXAME", 10, 60, 130, 4), line("PLANTAO", 8, 180))],
        BRACKETS
      );

      expect(t.revenue).toBe(1300);
      expect(t.unpricedCost).toBe(1440);
      expect(t.profit).toBeCloseTo(312.1, 2); // igual ao caso sem plantão
      expect(t.totalValue).toBe(2040); // mas o repasse total inclui o plantão
    });

    it("acusa prejuízo quando o repasse passa do que sobra", () => {
      // Ultrassom real: cobra 87, taxa 26,76% (23,28), custo 25 => sobram 38,72
      const t = summarizeDailyEntries([detalhado(line("EXAME", 1, 45, 87, 25))], BRACKETS);
      expect(t.profit).toBeCloseTo(-6.28, 2);
    });

    it("valor sem detalhe não inventa margem", () => {
      const t = summarizeDailyEntries([valor(5000)], BRACKETS);
      expect(t.revenue).toBe(0);
      expect(t.profit).toBe(0);
    });
  });
});
