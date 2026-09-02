import { describe, expect, it } from "vitest";
import { separarPorNatureza, VENCIMENTOS_POR_NATUREZA } from "./vencimentos";
import type { ScheduledEntry } from "@/lib/generated/prisma/client";

/** Um lançamento com só o que a separação olha. O resto do registro não
 * participa da regra, e preenchê-lo só esconderia o que importa. */
function lancamento(dia: string, type: "PAYABLE" | "RECEIVABLE"): ScheduledEntry {
  return {
    id: `${type}-${dia}`,
    description: `${type} ${dia}`,
    dueDate: new Date(`2026-09-${dia}T00:00:00.000Z`),
    type,
  } as ScheduledEntry;
}

/** A janela chega do banco já ordenada por vencimento — é assim que a
 * separação a recebe na vida real. */
function janela(...itens: [string, "PAYABLE" | "RECEIVABLE"][]): ScheduledEntry[] {
  return itens.map(([dia, tipo]) => lancamento(dia, tipo));
}

describe("a pagar vem antes de a receber", () => {
  it("separa as duas naturezas mantendo a ordem de vencimento dentro de cada uma", () => {
    const r = separarPorNatureza(
      janela(["02", "RECEIVABLE"], ["05", "PAYABLE"], ["08", "RECEIVABLE"], ["11", "PAYABLE"])
    );

    expect(r.aPagar.map((e) => e.id)).toEqual(["PAYABLE-05", "PAYABLE-11"]);
    expect(r.aReceber.map((e) => e.id)).toEqual(["RECEIVABLE-02", "RECEIVABLE-08"]);
  });

  it("conta o que existe, não o que coube", () => {
    const muitos = janela(
      ...(["01", "02", "03", "04", "05", "06", "07"].map((d) => [d, "PAYABLE"]) as [
        string,
        "PAYABLE",
      ][])
    );

    const r = separarPorNatureza(muitos);
    expect(r.aPagar).toHaveLength(VENCIMENTOS_POR_NATUREZA);
    // Sem este total a tela cortaria calado, e sete viraria cinco sem aviso.
    expect(r.totalPagar).toBe(7);
  });

  it("uma semana só de contas a pagar não engole os recebimentos", () => {
    // O caso que a cota por natureza existe para evitar: com um teto único de
    // cinco, os dois recebimentos do fim do mês não apareceriam.
    const r = separarPorNatureza(
      janela(
        ["01", "PAYABLE"],
        ["02", "PAYABLE"],
        ["03", "PAYABLE"],
        ["04", "PAYABLE"],
        ["05", "PAYABLE"],
        ["06", "PAYABLE"],
        ["28", "RECEIVABLE"],
        ["29", "RECEIVABLE"]
      )
    );

    expect(r.aPagar).toHaveLength(5);
    expect(r.totalPagar).toBe(6);
    expect(r.aReceber.map((e) => e.id)).toEqual(["RECEIVABLE-28", "RECEIVABLE-29"]);
  });

  it("um grupo vazio continua vazio, sem inventar linha", () => {
    const r = separarPorNatureza(janela(["03", "PAYABLE"], ["09", "PAYABLE"]));

    expect(r.totalPagar).toBe(2);
    expect(r.aReceber).toEqual([]);
    expect(r.totalReceber).toBe(0);
  });

  it("janela vazia devolve os dois grupos vazios", () => {
    const r = separarPorNatureza([]);
    expect(r).toEqual({ aPagar: [], aReceber: [], totalPagar: 0, totalReceber: 0 });
  });
});
