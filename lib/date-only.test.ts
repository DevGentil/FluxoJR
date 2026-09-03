import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  currentMonthKey,
  endOfDay,
  firstDayOfMonth,
  parseDateOnly,
  presetRange,
  startOfMonth,
  startOfNextMonth,
  startOfWeek,
  toDateOnly,
  toMonthKey,
  todayDateOnly,
} from "./date-only";

describe("parseDateOnly", () => {
  it("grava na meia-noite UTC, não na local", () => {
    expect(parseDateOnly("2026-08-01").toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("sobrevive à ida e volta, inclusive em 29 de fevereiro", () => {
    expect(toDateOnly(parseDateOnly("2028-02-29"))).toBe("2028-02-29");
  });
});

describe("toMonthKey", () => {
  it("põe o dia 1º no mês certo", () => {
    // O bug que isso evita: em UTC-3, getMonth() de 2026-08-01T00:00Z
    // devolve julho, porque no relógio local ainda são 21h do dia 31.
    expect(toMonthKey(parseDateOnly("2026-08-01"))).toBe("2026-08");
  });

  it("põe o último dia do mês no mês certo", () => {
    expect(toMonthKey(parseDateOnly("2026-08-31"))).toBe("2026-08");
  });
});

describe("limites de filtro", () => {
  it("o começo do dia inclui o próprio dia", () => {
    const dia = parseDateOnly("2026-08-01");
    expect(dia >= startOfMonth("2026-08")).toBe(true);
  });

  it("o fim do dia inclui tudo do último dia e nada do seguinte", () => {
    const fim = endOfDay("2026-08-31");
    expect(parseDateOnly("2026-08-31") <= fim).toBe(true);
    expect(parseDateOnly("2026-09-01") <= fim).toBe(false);
  });

  it("o mês seguinte é o lado aberto do intervalo", () => {
    const limite = startOfNextMonth("2026-08");
    expect(parseDateOnly("2026-08-31") < limite).toBe(true);
    expect(parseDateOnly("2026-09-01") < limite).toBe(false);
  });

  it("vira o ano corretamente", () => {
    expect(startOfNextMonth("2026-12").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("todayDateOnly", () => {
  it("usa o calendário local, não o UTC", () => {
    // 28/08 às 22h em Brasília já é 29/08 em UTC — toISOString() aqui
    // devolveria amanhã, e os presets de período pulariam um dia.
    const noite = new Date(2026, 7, 28, 22, 30);
    expect(todayDateOnly(noite)).toBe("2026-08-28");
  });

  it("currentMonthKey segue o mesmo calendário", () => {
    expect(currentMonthKey(new Date(2026, 7, 31, 23, 0))).toBe("2026-08");
  });
});

describe("aritmética de calendário", () => {
  it("soma dias atravessando o mês", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("subtrai dias atravessando o ano", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("não escorrega em mês curto ao somar meses", () => {
    expect(addMonths("2026-01", 1)).toBe("2026-02");
    expect(addMonths("2026-01", -2)).toBe("2025-11");
  });

  it("acha a segunda-feira da semana", () => {
    // 2026-08-28 é uma sexta-feira.
    expect(startOfWeek("2026-08-28")).toBe("2026-08-24");
  });

  it("no domingo, volta para a segunda anterior", () => {
    // 2026-08-30 é um domingo.
    expect(startOfWeek("2026-08-30")).toBe("2026-08-24");
  });

  it("na própria segunda, fica onde está", () => {
    expect(startOfWeek("2026-08-24")).toBe("2026-08-24");
  });

  it("acha o primeiro dia do mês", () => {
    expect(firstDayOfMonth("2026-08-28")).toBe("2026-08-01");
  });
});

describe("presetRange", () => {
  it("hoje é só o dia de hoje", () => {
    expect(presetRange("today", new Date(2026, 7, 28))).toEqual({
      from: "2026-08-28",
      to: "2026-08-28",
    });
  });

  it("esta semana começa na segunda-feira", () => {
    // 28/08/2026 é uma sexta.
    expect(presetRange("week", new Date(2026, 7, 28))).toEqual({
      from: "2026-08-24",
      to: "2026-08-28",
    });
  });

  it("este mês começa no dia 1º", () => {
    expect(presetRange("month", new Date(2026, 7, 28))).toEqual({
      from: "2026-08-01",
      to: "2026-08-28",
    });
  });

  it("mês passado é o mês inteiro anterior, não até o mesmo dia", () => {
    // Perguntado no dia 5 de setembro, "mês passado" é agosto inteiro — do
    // dia 1º ao dia 31 — e não "de 5/08 a 5/09", que seria outra pergunta.
    expect(presetRange("lastMonth", new Date(2026, 8, 5))).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("mês passado atravessa o ano em janeiro", () => {
    expect(presetRange("lastMonth", new Date(2026, 0, 15))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("mês passado respeita um fevereiro de 28 dias", () => {
    // 2026 não é bissexto.
    expect(presetRange("lastMonth", new Date(2026, 2, 10))).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("mês passado respeita um fevereiro bissexto", () => {
    expect(presetRange("lastMonth", new Date(2024, 2, 10))).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });
});
