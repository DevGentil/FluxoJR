import { describe, expect, it } from "vitest";
import { groupByPeriod, mesesNecessarios, type MonthTotals } from "./period-comparison";

const meses: MonthTotals[] = [
  { month: "2026-01", income: 100, expense: 40 },
  { month: "2026-02", income: 200, expense: 50 },
  { month: "2026-03", income: 300, expense: 60 },
  { month: "2026-04", income: 400, expense: 70 },
  { month: "2026-07", income: 500, expense: 80 },
  { month: "2027-01", income: 600, expense: 90 },
];

describe("groupByPeriod", () => {
  it("mensal devolve um período por mês, na ordem", () => {
    const r = groupByPeriod(meses, "month");
    expect(r.map((p) => p.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-07",
      "2027-01",
    ]);
    expect(r[0]).toMatchObject({ label: "jan/26", income: 100, expense: 40, net: 60 });
  });

  it("trimestral junta os três meses do trimestre", () => {
    const r = groupByPeriod(meses, "quarter");
    const t1 = r.find((p) => p.key === "2026-Q1")!;
    expect(t1.income).toBe(600); // 100 + 200 + 300
    expect(t1.expense).toBe(150);
    expect(t1.net).toBe(450);
    expect(t1.label).toBe("1º tri/26");

    // Abril e julho caem em trimestres diferentes.
    expect(r.find((p) => p.key === "2026-Q2")?.income).toBe(400);
    expect(r.find((p) => p.key === "2026-Q3")?.income).toBe(500);
  });

  it("semestral separa no meio do ano", () => {
    const r = groupByPeriod(meses, "semester");
    expect(r.find((p) => p.key === "2026-S1")?.income).toBe(1000); // jan a abr
    expect(r.find((p) => p.key === "2026-S2")?.income).toBe(500); // julho
    expect(r.find((p) => p.key === "2026-S1")?.label).toBe("1º sem/26");
  });

  it("anual junta o ano inteiro e nao mistura anos", () => {
    const r = groupByPeriod(meses, "year");
    expect(r).toHaveLength(2);
    expect(r.find((p) => p.key === "2026")?.income).toBe(1500);
    expect(r.find((p) => p.key === "2027")?.income).toBe(600);
  });

  it("ordena do mais antigo para o mais recente, virando o ano", () => {
    expect(groupByPeriod(meses, "year").map((p) => p.key)).toEqual(["2026", "2027"]);
  });

  it("nao inventa periodo quando nao ha mes nenhum", () => {
    expect(groupByPeriod([], "quarter")).toEqual([]);
  });

  it("resultado negativo aparece como negativo", () => {
    const r = groupByPeriod([{ month: "2026-05", income: 10, expense: 30 }], "month");
    expect(r[0].net).toBe(-20);
  });
});

describe("mesesNecessarios", () => {
  it("pede um período a mais, para o primeiro da série ter com o que comparar", () => {
    expect(mesesNecessarios("month", 6)).toBe(7);
    expect(mesesNecessarios("quarter", 4)).toBe(15);
    expect(mesesNecessarios("semester", 4)).toBe(30);
    expect(mesesNecessarios("year", 3)).toBe(48);
  });
});
