import * as XLSX from "xlsx";
import { formatDate } from "@/lib/format";

/** O extrato de transações como Excel — a mesma lista da tela, com resumo e
 * moeda formatada, em vez do CSV cru que só um número por linha.
 *
 * Igual ao `lib/dre-planilha.ts` na filosofia: a planilha existe para ser
 * levada embora e trabalhada por fora, então os valores são números de
 * verdade (com formato de moeda aplicado à célula), não texto — quem abre no
 * Excel soma uma coluna sem precisar converter nada primeiro. */

export interface LinhaTransacaoPlanilha {
  data: Date;
  conta: string;
  descricao: string;
  categoria: string;
  fornecedor: string;
  tipo: "INCOME" | "EXPENSE";
  valor: number;
}

const CABECALHO = ["Data", "Conta", "Descrição", "Categoria", "Fornecedor", "Tipo", "Valor"];
const FORMATO_MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const COLUNA_VALOR = 6; // G, base zero

type Linha = (string | number)[];

/** As linhas da planilha: cabeçalho, cada transação, uma em branco e o
 * resumo de entradas/saídas/resultado — a mesma soma que os cartões da tela
 * mostram, para quem abre a planilha não precisar somar a coluna por conta
 * própria antes de conferir. */
export function construirLinhasTransacoes(linhas: LinhaTransacaoPlanilha[]): Linha[] {
  const saida: Linha[] = [[...CABECALHO]];

  for (const l of linhas) {
    saida.push([
      formatDate(l.data),
      l.conta,
      l.descricao,
      l.categoria,
      l.fornecedor,
      l.tipo === "INCOME" ? "Entrada" : "Saída",
      l.tipo === "EXPENSE" ? -l.valor : l.valor,
    ]);
  }

  const entradas = linhas.filter((l) => l.tipo === "INCOME").reduce((s, l) => s + l.valor, 0);
  const saidas = linhas.filter((l) => l.tipo === "EXPENSE").reduce((s, l) => s + l.valor, 0);

  saida.push([]);
  saida.push(["Total de entradas", "", "", "", "", "", entradas]);
  saida.push(["Total de saídas", "", "", "", "", "", -saidas]);
  saida.push(["Resultado", "", "", "", "", "", entradas - saidas]);

  return saida;
}

function construirPlanilha(linhas: LinhaTransacaoPlanilha[]): XLSX.WorkBook {
  const dados = construirLinhasTransacoes(linhas);
  const ws = XLSX.utils.aoa_to_sheet(dados);

  for (let i = 0; i < dados.length; i++) {
    const endereco = XLSX.utils.encode_cell({ r: i, c: COLUNA_VALOR });
    const celula = ws[endereco];
    if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
  }

  ws["!cols"] = [
    { wch: 12 },
    { wch: 22 },
    { wch: 40 },
    { wch: 24 },
    { wch: 24 },
    { wch: 10 },
    { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transações");
  return wb;
}

export function baixarPlanilhaTransacoes(linhas: LinhaTransacaoPlanilha[], nomeArquivo: string): void {
  XLSX.writeFile(construirPlanilha(linhas), nomeArquivo);
}
