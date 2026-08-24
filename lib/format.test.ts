import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, toDateInputValue } from "./format";

describe("formatCurrency", () => {
  it("formata valores positivos em Real", () => {
    expect(formatCurrency(1234.56)).toBe("R$ 1.234,56");
  });

  it("formata zero", () => {
    expect(formatCurrency(0)).toBe("R$ 0,00");
  });

  it("formata valores negativos", () => {
    expect(formatCurrency(-50)).toBe("-R$ 50,00");
  });
});

describe("formatDate", () => {
  it("formata uma string ISO no padrão brasileiro", () => {
    expect(formatDate("2026-08-24")).toBe("24/08/2026");
  });

  it("formata um objeto Date no padrão brasileiro", () => {
    expect(formatDate(new Date(Date.UTC(2026, 0, 5)))).toBe("05/01/2026");
  });
});

describe("toDateInputValue", () => {
  it("converte uma string de data para o formato yyyy-mm-dd", () => {
    expect(toDateInputValue("2026-08-24T00:00:00.000Z")).toBe("2026-08-24");
  });

  it("converte um objeto Date para o formato yyyy-mm-dd", () => {
    expect(toDateInputValue(new Date(Date.UTC(2026, 7, 24)))).toBe("2026-08-24");
  });
});
