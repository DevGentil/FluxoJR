import { describe, expect, it } from "vitest";
import { diff, resumirMudancas } from "./audit";
import { parseDateOnly } from "./date-only";

describe("diff", () => {
  it("descreve a mudança do jeito que se lê", () => {
    expect(diff("ECG", 45, 25)).toBe("ECG: R$ 45,00 → R$ 25,00");
  });

  it("devolve nulo quando nada mudou", () => {
    // O ponto: sem isso, salvar um formulário sem alterar nada gravaria um
    // registro dizendo que alterou — e um log cheio de "alterou (nada)"
    // esconde as alterações de verdade.
    expect(diff("ECG", 45, 45)).toBeNull();
    expect(diff("Nome", "Dr. Carlos", "Dr. Carlos")).toBeNull();
  });

  it("nomeia o vazio em vez de mostrar null", () => {
    expect(diff("CRM", null, "12345")).toBe("CRM: vazio → 12345");
    expect(diff("CRM", "12345", "")).toBe("CRM: 12345 → vazio");
  });

  it("escreve booleano como sim e não", () => {
    expect(diff("Ativo", true, false)).toBe("Ativo: sim → não");
  });

  it("mostra data no formato de quem lê, sem escorregar de dia", () => {
    // Data de calendário é meia-noite UTC no sistema inteiro; formatar no
    // fuso local devolveria o dia anterior em UTC-3.
    const jan = parseDateOnly("2026-01-01");
    const jun = parseDateOnly("2026-06-01");
    expect(diff("Vigência", jan, jun)).toBe("Vigência: 01/01/2026 → 01/06/2026");
  });
});

describe("resumirMudancas", () => {
  it("junta só o que mudou", () => {
    const resumo = resumirMudancas(
      diff("Valor", 45, 25),
      diff("Vigência", parseDateOnly("2026-01-01"), parseDateOnly("2026-01-01")),
      diff("Ativo", true, false)
    );
    expect(resumo).toBe("Valor: R$ 45,00 → R$ 25,00 · Ativo: sim → não");
  });

  it("devolve nulo quando nada mudou, para a ação não registrar nada", () => {
    expect(resumirMudancas(diff("Valor", 45, 45), diff("Ativo", true, true))).toBeNull();
  });
});
