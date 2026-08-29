import { describe, expect, it } from "vitest";
import { compareBy, parseSort, sortBy, type Sort } from "./sorting";
import { parseDateOnly } from "./date-only";

const COLUNAS = ["nome", "valor", "data"] as const;
type Coluna = (typeof COLUNAS)[number];
const PADRAO: Sort<Coluna> = { field: "nome", dir: "asc" };

describe("parseSort", () => {
  it("aceita um campo da lista", () => {
    expect(parseSort({ sort: "valor", dir: "desc" }, COLUNAS, PADRAO)).toEqual({ field: "valor", dir: "desc" });
  });

  it("cai no padrão quando o campo não está na lista", () => {
    // O valor vem da URL. Sem a lista, daria para pedir ordem por uma coluna
    // que a tela não mostra — ou, num `orderBy` de Prisma, por um campo que
    // a consulta nem selecionou.
    expect(parseSort({ sort: "rate" }, COLUNAS, PADRAO)).toEqual(PADRAO);
    expect(parseSort({ sort: "__proto__" }, COLUNAS, PADRAO)).toEqual(PADRAO);
  });

  it("cai no padrão quando não há campo nenhum", () => {
    expect(parseSort({}, COLUNAS, PADRAO)).toEqual(PADRAO);
  });

  it("ignora a direção solta, sem campo válido junto", () => {
    // Senão `?dir=desc` sozinho inverteria a ordem padrão da tela.
    expect(parseSort({ dir: "desc" }, COLUNAS, PADRAO)).toEqual(PADRAO);
    expect(parseSort({ sort: "inexistente", dir: "desc" }, COLUNAS, PADRAO)).toEqual(PADRAO);
  });

  it("direção diferente de 'desc' é crescente", () => {
    expect(parseSort({ sort: "valor", dir: "qualquer" }, COLUNAS, PADRAO).dir).toBe("asc");
    expect(parseSort({ sort: "valor" }, COLUNAS, PADRAO).dir).toBe("asc");
  });
});

describe("sortBy", () => {
  it("ordena texto respeitando acento", () => {
    // Caso real: a base tem "Dra. Ângela" e "Dra. Zilda". Comparando pelo
    // código do caractere, "Â" (U+00C2) cai depois de "Z" (U+005A), e a
    // médica sumia do topo da lista.
    const nomes = ["Dra. Zilda", "Dra. Ângela", "Dr. Ávila", "Dr. Bruno"];
    expect(sortBy(nomes, (n) => n, "asc")).toEqual([
      "Dr. Ávila",
      "Dr. Bruno",
      "Dra. Ângela",
      "Dra. Zilda",
    ]);
  });

  it("ordena número por grandeza, não por texto", () => {
    // "1200" < "9" na comparação de texto.
    expect(sortBy([9, 1200, 80], (n) => n, "asc")).toEqual([9, 80, 1200]);
  });

  it("ordena data", () => {
    const dias = ["2026-08-01", "2026-01-15", "2026-12-31"].map(parseDateOnly);
    expect(sortBy(dias, (d) => d, "desc").map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-12-31",
      "2026-08-01",
      "2026-01-15",
    ]);
  });

  it("não mexe na lista original", () => {
    const original = [3, 1, 2];
    sortBy(original, (n) => n, "asc");
    expect(original).toEqual([3, 1, 2]);
  });
});

describe("sortBy com valor ausente", () => {
  const linhas = [
    { nome: "com margem", margem: 0.2 },
    { nome: "sem receita", margem: null },
    { nome: "no vermelho", margem: -0.1 },
  ];

  it("manda o ausente para o fim no crescente", () => {
    expect(sortBy(linhas, (l) => l.margem, "asc").map((l) => l.nome)).toEqual([
      "no vermelho",
      "com margem",
      "sem receita",
    ]);
  });

  it("manda o ausente para o fim TAMBÉM no decrescente", () => {
    // O ponto todo: um item sem receita não é "a pior margem", é "não dá
    // para calcular". Tratá-lo como o menor número o jogaria para o topo do
    // decrescente invertido e esconderia quem realmente está no vermelho.
    expect(sortBy(linhas, (l) => l.margem, "desc").map((l) => l.nome)).toEqual([
      "com margem",
      "no vermelho",
      "sem receita",
    ]);
  });

  it("trata string vazia como ausente", () => {
    const medicos = [{ crm: "12345" }, { crm: "" }, { crm: "9876" }];
    expect(sortBy(medicos, (m) => m.crm, "asc").map((m) => m.crm)).toEqual(["12345", "9876", ""]);
  });

  it("undefined também vai para o fim", () => {
    const linhas = [{ v: 2 }, { v: undefined }, { v: 1 }];
    expect(sortBy(linhas, (l) => l.v, "asc").map((l) => l.v)).toEqual([1, 2, undefined]);
  });
});

describe("compareBy", () => {
  it("empata dois ausentes", () => {
    expect(compareBy({ v: null }, { v: undefined }, (r) => r.v, "asc")).toBe(0);
  });

  it("ordena razão pela grandeza, não pelo rótulo formatado", () => {
    // Se a coluna "% margem" ordenasse pelo texto que aparece na tela,
    // "9,0%" viria depois de "12,3%". Por isso as telas passam a razão
    // (lucro/receita), não o texto.
    const unidades = [
      { nome: "A", lucro: 12.3, receita: 100 },
      { nome: "B", lucro: 9, receita: 100 },
    ];
    expect(sortBy(unidades, (u) => u.lucro / u.receita, "desc").map((u) => u.nome)).toEqual(["A", "B"]);
  });
});
