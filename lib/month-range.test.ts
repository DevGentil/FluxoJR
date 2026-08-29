import { describe, expect, it } from "vitest";
import { dateFilter, parseMonthRange } from "./month-range";
import { parseDateOnly } from "./date-only";

describe("parseMonthRange", () => {
  it("só vira intervalo quando os dois lados vêm", () => {
    expect(parseMonthRange({ from: "2026-01", to: "2026-08" })).toEqual({ from: "2026-01", to: "2026-08" });
    expect(parseMonthRange({ from: "2026-01" })).toBeNull();
    expect(parseMonthRange({ to: "2026-08" })).toBeNull();
    expect(parseMonthRange({})).toBeNull();
  });
});

describe("dateFilter", () => {
  it("sem intervalo, não filtra nada", () => {
    expect(dateFilter(null)).toBeUndefined();
  });

  it("abre no primeiro dia do mês inicial", () => {
    const f = dateFilter({ from: "2026-03", to: "2026-08" })!;
    expect(f.gte.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("fecha no primeiro dia do mês SEGUINTE, para não cortar o último dia", () => {
    // O erro que isso evita: terminar em 2026-08-01 deixaria de fora os 30
    // outros dias de agosto.
    const f = dateFilter({ from: "2026-03", to: "2026-08" })!;
    expect(f.lt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(parseDateOnly("2026-08-31") < f.lt).toBe(true);
    expect(parseDateOnly("2026-09-01") < f.lt).toBe(false);
  });

  it("vira o ano no limite superior", () => {
    expect(dateFilter({ from: "2026-12", to: "2026-12" })!.lt.toISOString()).toBe(
      "2027-01-01T00:00:00.000Z"
    );
  });

  it("um mês só continua sendo um intervalo válido", () => {
    const f = dateFilter({ from: "2026-08", to: "2026-08" })!;
    expect(parseDateOnly("2026-08-01") >= f.gte).toBe(true);
    expect(parseDateOnly("2026-08-31") < f.lt).toBe(true);
    expect(parseDateOnly("2026-07-31") >= f.gte).toBe(false);
  });

  it("ignora valor que não tem cara de mês, em vez de montar data inválida", () => {
    // Vem da URL, então pode chegar qualquer coisa.
    expect(dateFilter({ from: "abacaxi", to: "2026-08" })).toBeUndefined();
    expect(dateFilter({ from: "2026-08", to: "2026" })).toBeUndefined();
  });
});
