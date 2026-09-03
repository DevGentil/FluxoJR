import { describe, expect, it } from "vitest";
import { construirLinhasTransacoes, type LinhaTransacaoPlanilha } from "./transacoes-planilha";

function linha(overrides: Partial<LinhaTransacaoPlanilha> = {}): LinhaTransacaoPlanilha {
  return {
    data: new Date("2026-09-01T00:00:00.000Z"),
    conta: "Caixa Físico",
    descricao: "Aluguel do mês",
    categoria: "Aluguel",
    fornecedor: "—",
    tipo: "EXPENSE",
    valor: 3800,
    ...overrides,
  };
}

describe("a planilha de transações", () => {
  it("começa com o cabeçalho em português", () => {
    const linhas = construirLinhasTransacoes([]);
    expect(linhas[0]).toEqual(["Data", "Conta", "Descrição", "Categoria", "Fornecedor", "Tipo", "Valor"]);
  });

  it("saída sai negativa, entrada sai positiva — a coluna soma sozinha", () => {
    const linhas = construirLinhasTransacoes([
      linha({ tipo: "EXPENSE", valor: 3800 }),
      linha({ tipo: "INCOME", valor: 5000, descricao: "Convênio" }),
    ]);

    expect(linhas[1][6]).toBe(-3800);
    expect(linhas[1][5]).toBe("Saída");
    expect(linhas[2][6]).toBe(5000);
    expect(linhas[2][5]).toBe("Entrada");
  });

  it("fecha com entradas, saídas e resultado, na mesma conta que os cartões da tela", () => {
    const linhas = construirLinhasTransacoes([
      linha({ tipo: "INCOME", valor: 5000 }),
      linha({ tipo: "EXPENSE", valor: 3800 }),
      linha({ tipo: "EXPENSE", valor: 200 }),
    ]);

    const fecho = linhas.slice(-3);
    expect(fecho[0]).toEqual(["Total de entradas", "", "", "", "", "", 5000]);
    expect(fecho[1]).toEqual(["Total de saídas", "", "", "", "", "", -4000]);
    expect(fecho[2]).toEqual(["Resultado", "", "", "", "", "", 1000]);
  });

  it("sem lançamento nenhum, ainda fecha com zeros — não quebra", () => {
    const linhas = construirLinhasTransacoes([]);
    expect(linhas).toHaveLength(5); // cabeçalho + branco + 3 do fecho
    expect(linhas[4]).toEqual(["Resultado", "", "", "", "", "", 0]);
  });
});
