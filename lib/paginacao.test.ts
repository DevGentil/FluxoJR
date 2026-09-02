import { describe, expect, it } from "vitest";
import { POR_PAGINA, lerPagina, paginaDoIndice } from "./paginacao";

describe("lerPagina", () => {
  it("lê o número quando ele é um inteiro positivo", () => {
    expect(lerPagina("1")).toBe(1);
    expect(lerPagina("7")).toBe(7);
  });

  it("cai na primeira página quando o parâmetro não veio", () => {
    expect(lerPagina(undefined)).toBe(1);
    expect(lerPagina("")).toBe(1);
  });

  // O endereço é editável à mão, e o valor vai direto para o `skip` do banco.
  // Sem isto, `?page=-2` pediria `skip: -90` e derrubaria a tela.
  it("recusa o que não é página e devolve 1", () => {
    expect(lerPagina("abc")).toBe(1);
    expect(lerPagina("0")).toBe(1);
    expect(lerPagina("-2")).toBe(1);
    expect(lerPagina("1.5")).toBe(1);
    expect(lerPagina("2e3")).toBe(2000); // notação científica ainda é inteiro
  });
});

describe("paginaDoIndice", () => {
  it("põe os primeiros registros na página 1", () => {
    expect(paginaDoIndice(0, 10)).toBe(1);
    expect(paginaDoIndice(9, 10)).toBe(1);
  });

  it("vira a página no primeiro registro seguinte", () => {
    expect(paginaDoIndice(10, 10)).toBe(2);
    expect(paginaDoIndice(29, 10)).toBe(3);
  });

  it("usa o tamanho padrão quando nenhum é informado", () => {
    expect(paginaDoIndice(POR_PAGINA - 1)).toBe(1);
    expect(paginaDoIndice(POR_PAGINA)).toBe(2);
  });
});
