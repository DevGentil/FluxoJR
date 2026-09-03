import { describe, expect, it } from "vitest";
import { agruparPorCategoria, demonstrativoDe, type LinhaCrua } from "./repasse-demonstrativo";

function linha(nome: string, categoria: string, quantidade: number, taxa: number): LinhaCrua {
  return { quantity: quantidade, rate: taxa, serviceItem: { name: nome, category: categoria } };
}

describe("agrupar por categoria", () => {
  it("separa consulta, exame e procedimento", () => {
    const grupos = agruparPorCategoria([
      linha("Ultrassom", "EXAME", 15, 50),
      linha("Consulta", "CONSULTA", 39, 80),
      linha("Infiltração", "PROCEDIMENTO", 2, 120),
    ]);

    // A ordem é a do vocabulário do catálogo: consulta primeiro, porque é o
    // que traz o paciente.
    expect(grupos.map((g) => g.categoria)).toEqual(["CONSULTA", "EXAME", "PROCEDIMENTO"]);
    expect(grupos[0]).toMatchObject({ rotulo: "Consulta", quantidade: 39, total: 3120 });
    expect(grupos[1]).toMatchObject({ quantidade: 15, total: 750 });
  });

  it("soma o mesmo item lançado em dias diferentes", () => {
    const grupos = agruparPorCategoria([
      linha("Consulta", "CONSULTA", 39, 80),
      linha("Consulta", "CONSULTA", 12, 80),
    ]);

    expect(grupos[0].itens).toHaveLength(1);
    expect(grupos[0].itens[0]).toMatchObject({ quantidade: 51, subtotal: 4080 });
  });

  it("mantém separado o mesmo item a taxas diferentes", () => {
    // Um reajuste no meio do mês. Somar as duas esconderia justamente o que
    // o médico precisa conferir.
    const grupos = agruparPorCategoria([
      linha("Consulta", "CONSULTA", 10, 80),
      linha("Consulta", "CONSULTA", 5, 90),
    ]);

    expect(grupos[0].itens).toHaveLength(2);
    expect(grupos[0].itens.map((i) => i.taxa).sort()).toEqual([80, 90]);
    expect(grupos[0].total).toBe(10 * 80 + 5 * 90);
  });

  it("categoria desconhecida cai em Outro em vez de sumir", () => {
    const grupos = agruparPorCategoria([linha("Auxílio", "INVENTADA", 1, 50)]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].categoria).toBe("OUTRO");
    expect(grupos[0].total).toBe(50);
  });

  it("sem linhas, nenhum grupo", () => {
    expect(agruparPorCategoria([])).toEqual([]);
  });
});

describe("demonstrativo do período", () => {
  it("soma os dias detalhados num consolidado só", () => {
    const d = demonstrativoDe([
      { amount: null, lines: [linha("Consulta", "CONSULTA", 39, 80), linha("Ultrassom", "EXAME", 15, 50)] },
      { amount: null, lines: [linha("Consulta", "CONSULTA", 12, 80)] },
    ]);

    expect(d.grupos[0].itens[0].quantidade).toBe(51);
    expect(d.total).toBe(51 * 80 + 15 * 50);
    expect(d.totalSemDetalhe).toBe(0);
    expect(d.diasSemDetalhe).toBe(0);
  });

  it("mantém o valor sem detalhe fora do detalhado", () => {
    // A diferença entre "o médico atendeu isto" e "alguém digitou este
    // valor". Somar os dois numa linha só faria o documento afirmar um
    // detalhamento que não existe.
    const d = demonstrativoDe([
      { amount: null, lines: [linha("Consulta", "CONSULTA", 10, 80)] },
      { amount: 1500, lines: [] },
      { amount: 900, lines: [] },
    ]);

    expect(d.totalDetalhado).toBe(800);
    expect(d.totalSemDetalhe).toBe(2400);
    expect(d.diasSemDetalhe).toBe(2);
    expect(d.total).toBe(3200);
  });

  it("um mês inteiro sem detalhe não inventa grupos", () => {
    // É o caso da base real importada: 2.483 lançamentos, nenhum com item.
    const d = demonstrativoDe([
      { amount: 1200, lines: [] },
      { amount: 800, lines: [] },
    ]);

    expect(d.grupos).toEqual([]);
    expect(d.totalDetalhado).toBe(0);
    expect(d.total).toBe(2000);
  });

  it("período vazio devolve zeros, não erro", () => {
    expect(demonstrativoDe([])).toEqual({
      grupos: [],
      totalDetalhado: 0,
      totalSemDetalhe: 0,
      diasSemDetalhe: 0,
      total: 0,
    });
  });
});
