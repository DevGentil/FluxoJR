import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatMonth,
  formatPercent,
  formatWeekday,
  toDateInputValue,
} from "./format";

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

describe("formatMonth", () => {
  it("aceita uma data", () => {
    expect(formatMonth(new Date("2026-08-15T00:00:00.000Z"))).toBe("agosto de 2026");
  });

  it("aceita a chave curta do mês", () => {
    expect(formatMonth("2026-01")).toBe("janeiro de 2026");
  });

  it("não escorrega para o mês anterior no dia 1º", () => {
    // A data é meia-noite UTC; renderizar no fuso local mostraria 31/07.
    expect(formatMonth("2026-08")).toBe("agosto de 2026");
  });
});

describe("formatWeekday", () => {
  it("abrevia sem o ponto", () => {
    // 2026-08-24 é uma segunda-feira.
    expect(formatWeekday(new Date("2026-08-24T00:00:00.000Z"))).toBe("seg");
  });
});

describe("formatPercent", () => {
  it("calcula a proporção", () => {
    expect(formatPercent(25, 200)).toBe("12.5%");
  });

  it("aceita o número de casas", () => {
    expect(formatPercent(1, 3, 0)).toBe("33%");
  });

  it("devolve travessão quando não há base — em vez de dividir por zero", () => {
    expect(formatPercent(10, 0)).toBe("—");
  });
});

describe("formatBytes", () => {
  it("mostra bytes puros abaixo de 1 KB", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("passa para KB e MB", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
