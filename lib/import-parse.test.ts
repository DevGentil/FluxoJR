import { describe, expect, it } from "vitest";
import { normalizeAmount, normalizeDate } from "./import-parse";

describe("normalizeDate", () => {
  it("converte data no formato brasileiro dd/mm/yyyy", () => {
    expect(normalizeDate("24/08/2026")).toBe("2026-08-24");
  });

  it("converte data no formato brasileiro com ano de 2 dígitos", () => {
    expect(normalizeDate("24/08/26")).toBe("2026-08-24");
  });

  it("aceita dia/mês sem zero à esquerda", () => {
    expect(normalizeDate("5/3/2026")).toBe("2026-03-05");
  });

  it("converte data no formato ISO yyyy-mm-dd", () => {
    expect(normalizeDate("2026-08-24")).toBe("2026-08-24");
  });

  it("converte um objeto Date", () => {
    // É assim que a célula de data chega: o SheetJS (cellDates) devolve a
    // meia-noite do fuso local, não do UTC. Ler os componentes locais é o
    // que mantém o dia certo em qualquer fuso — passar por toISOString()
    // devolveria o dia anterior a leste de Greenwich.
    expect(normalizeDate(new Date(2026, 7, 24))).toBe("2026-08-24");
  });

  it("converte um número de série do Excel", () => {
    // 46000 corresponde a uma data de 2025 no calendário do Excel.
    expect(normalizeDate(46000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("retorna null para texto que não é uma data", () => {
    expect(normalizeDate("não é uma data")).toBeNull();
  });

  it("retorna null para valores vazios/indefinidos", () => {
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
    expect(normalizeDate(null)).toBeNull();
  });
});

describe("normalizeAmount", () => {
  it("aceita um número diretamente", () => {
    expect(normalizeAmount(150.5)).toBe(150.5);
  });

  it("converte formato brasileiro com separador de milhar e vírgula decimal", () => {
    expect(normalizeAmount("R$ 1.234,56")).toBe(1234.56);
  });

  it("converte formato com vírgula decimal sem separador de milhar", () => {
    expect(normalizeAmount("250,50")).toBe(250.5);
  });

  it("converte formato com ponto decimal (US)", () => {
    expect(normalizeAmount("1234.56")).toBe(1234.56);
  });

  it("preserva valores negativos", () => {
    expect(normalizeAmount("-50,00")).toBe(-50);
  });

  it("ignora espaços e o símbolo de moeda", () => {
    expect(normalizeAmount("  R$ 99,90  ")).toBe(99.9);
  });

  it("retorna null para texto vazio", () => {
    expect(normalizeAmount("")).toBeNull();
    expect(normalizeAmount("   ")).toBeNull();
  });

  it("retorna null para texto que não é um valor monetário", () => {
    expect(normalizeAmount("abc")).toBeNull();
  });

  it("retorna null para tipos inesperados", () => {
    expect(normalizeAmount(undefined)).toBeNull();
    expect(normalizeAmount(null)).toBeNull();
    expect(normalizeAmount({})).toBeNull();
  });
});

describe("normalizeAmount — formato brasileiro sem centavos", () => {
  it("lê o ponto como milhar quando vêm três casas", () => {
    // Antes virava R$ 12,50: uma despesa de doze mil e quinhentos entrava
    // na conta como doze reais e cinquenta.
    expect(normalizeAmount("12.500")).toBe(12500);
    expect(normalizeAmount("1.234")).toBe(1234);
  });

  it("lê milhar duplo em vez de descartar a linha", () => {
    // Antes devolvia null e a linha era silenciosamente pulada na importação.
    expect(normalizeAmount("1.234.567")).toBe(1234567);
  });

  it("preserva o sinal negativo no formato de milhar", () => {
    expect(normalizeAmount("-2.000")).toBe(-2000);
  });

  it("continua lendo ponto decimal americano", () => {
    expect(normalizeAmount("1.5")).toBe(1.5);
    expect(normalizeAmount("1.50")).toBe(1.5);
    expect(normalizeAmount("1234.56")).toBe(1234.56);
  });

  it("não confunde fração com milhar quando a parte inteira é zero", () => {
    expect(normalizeAmount("0.500")).toBe(0.5);
  });
});
