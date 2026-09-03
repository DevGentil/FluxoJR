import { describe, expect, it } from "vitest";
import { construirLinhasDre, competenciaCurta } from "./dre-planilha";
import type { Dre } from "./dre";

/** Um DRE de duas classificações, para provar que a planilha reproduz a
 * estrutura exata dos arquivos que a contabilidade já usa — não uma
 * aproximação em CSV agrupado por categoria. */
function dreDeExemplo(): Dre {
  return {
    mes: "2026-07",
    faturamento: [
      { rotulo: "Consultas", valor: 12750 },
      { rotulo: "Exames Laboratoriais", valor: 35222.2 },
    ],
    receitaTotal: 47972.2,
    grupos: [
      {
        classificacao: "Auxílio Funcionário (Saúde/Educação)",
        categoriaFinanceira: "Funcionários",
        lancamentos: [
          {
            id: "l1",
            data: new Date("2026-07-02T00:00:00.000Z"),
            favorecido: "Hiago Jordan Da Silva Salvador",
            descricao: "Prolabore/ Consulta mês",
            valor: 40,
          },
          {
            id: "l2",
            data: new Date("2026-07-02T00:00:00.000Z"),
            favorecido: "Maria Clara Souza da Silva",
            descricao: "Prolabore/ Consulta mês",
            valor: 40,
          },
        ],
        total: 80,
      },
      {
        classificacao: "Água",
        categoriaFinanceira: "Administrativas",
        lancamentos: [
          {
            id: "l3",
            data: new Date("2026-07-24T00:00:00.000Z"),
            favorecido: "Fornecedor Água e Esgoto (SABESP)",
            descricao: "Conta Copasa JUL/2026",
            valor: 353.62,
          },
        ],
        total: 353.62,
      },
    ],
    despesaTotal: 433.62,
    resultado: 47538.58,
    quantidade: 3,
  };
}

describe("a planilha reproduz a estrutura exata do arquivo de origem", () => {
  it("abre com FATURAMENTO BRUTO e fecha o bloco com Total Geral", () => {
    const linhas = construirLinhasDre(dreDeExemplo());

    expect(linhas[0]).toEqual(["FATURAMENTO BRUTO"]);
    expect(linhas[1]).toEqual(["Consultas", "", "", "", "", 12750]);
    expect(linhas[2]).toEqual(["Exames Laboratoriais", "", "", "", "", 35222.2]);
    expect(linhas[3]).toEqual(["Total Geral", "", "", "", "", 47972.2]);
    // Uma linha em branco separa o faturamento do cabeçalho analítico.
    expect(linhas[4]).toEqual([]);
  });

  it("o cabeçalho das despesas usa exatamente o texto do arquivo de origem", () => {
    const linhas = construirLinhasDre(dreDeExemplo());
    expect(linhas[5]).toEqual([
      "Data Vencimento",
      "Categoria Financeira",
      "Classificacao Financeira",
      "Nome Favorecido",
      "Descricao Pagamento",
      "Valor Pago",
    ]);
  });

  it("cada lançamento leva a data formatada, o par categoria/classificação e o valor", () => {
    const linhas = construirLinhasDre(dreDeExemplo());
    expect(linhas[6]).toEqual([
      "02/07/2026",
      "Funcionários",
      "Auxílio Funcionário (Saúde/Educação)",
      "Hiago Jordan Da Silva Salvador",
      "Prolabore/ Consulta mês",
      40,
    ]);
  });

  it("o subtotal fica em branco nas cinco primeiras colunas, sem rótulo", () => {
    // É o que separa esta planilha de um relatório qualquer agrupado: o
    // arquivo de origem não escreve "Total em X" — só o número, alinhado
    // com a mesma coluna de todo o resto.
    const linhas = construirLinhasDre(dreDeExemplo());
    const grupo1 = linhas.slice(6, 9); // 2 lançamentos + subtotal
    expect(grupo1[2]).toEqual(["", "", "", "", "", 80]);
  });

  it("uma linha em branco separa cada classificação da próxima", () => {
    const linhas = construirLinhasDre(dreDeExemplo());
    // índice 9 = branco depois do primeiro grupo; 10 = primeiro lançamento
    // do segundo grupo.
    expect(linhas[9]).toEqual([]);
    expect(linhas[10]).toEqual([
      "24/07/2026",
      "Administrativas",
      "Água",
      "Fornecedor Água e Esgoto (SABESP)",
      "Conta Copasa JUL/2026",
      353.62,
    ]);
  });

  it("fecha com RECEITAS, DESPESAS e o resultado combinado, nessa ordem", () => {
    const linhas = construirLinhasDre(dreDeExemplo());
    const fecho = linhas.slice(-3);
    expect(fecho).toEqual([
      ["RECEITAS", "", "", "", "", 47972.2],
      ["DESPESAS", "", "", "", "", 433.62],
      ["LUCRO/PREJUÍZO APURADO", "", "", "", "", 47538.58],
    ]);
  });

  it("um mês sem receita não quebra a planilha", () => {
    const dre = dreDeExemplo();
    dre.faturamento = [];
    dre.receitaTotal = 0;

    const linhas = construirLinhasDre(dre);
    expect(linhas[0]).toEqual(["FATURAMENTO BRUTO"]);
    expect(linhas[1][0]).toBe("Nenhuma receita na competência");
    expect(linhas[2]).toEqual(["Total Geral", "", "", "", "", 0]);
  });

  it("sem despesa nenhuma, vai direto do cabeçalho para o fecho", () => {
    const dre = dreDeExemplo();
    dre.grupos = [];
    dre.despesaTotal = 0;
    dre.resultado = dre.receitaTotal;

    const linhas = construirLinhasDre(dre);
    const posCabecalho = linhas[6];
    expect(posCabecalho[0]).toBe("RECEITAS");
  });
});

describe("competenciaCurta", () => {
  it("converte 'AAAA-MM' para 'MM-AA', como nos arquivos da holding", () => {
    expect(competenciaCurta("2026-07")).toBe("07-26");
    expect(competenciaCurta("2026-12")).toBe("12-26");
  });
});
