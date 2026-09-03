import * as XLSX from "xlsx";
import { formatDate } from "@/lib/format";
import type { Dre } from "@/lib/dre";

/** O DRE como arquivo Excel — célula por célula igual à planilha que a
 * contabilidade já recebe (ver `DRE - Laguna 07-26.xlsx` e as demais que o
 * Davi mandou): faturamento bruto no topo, cada lançamento de despesa numa
 * linha com o vencimento, a categoria e a classificação financeira, o
 * favorecido e o valor, uma linha de subtotal em branco exceto o valor
 * depois de cada classificação, e o fecho com RECEITAS / DESPESAS /
 * LUCRO/PREJUÍZO APURADO.
 *
 * É a mesma extração que também alimenta o DRE impresso (`app/documento/dre`)
 * — os dois nascem do mesmo `montarDre()`, então a planilha que vai para o
 * contador e o PDF que a diretoria lê nunca podem divergir em número.
 *
 * Só a APARÊNCIA da planilha muda em relação ao PDF: aqui o subtotal fica em
 * branco nas cinco primeiras colunas, sem o rótulo "Total em X" que o PDF
 * mostra — é assim que o arquivo de origem é montado, e é isso que faz o
 * Excel exportado abrir do lado do Excel antigo sem parecer outra coisa. */

const CABECALHO_DESPESAS = [
  "Data Vencimento",
  "Categoria Financeira",
  "Classificacao Financeira",
  "Nome Favorecido",
  "Descricao Pagamento",
  "Valor Pago",
];

/** O mesmo formato de moeda em toda célula de valor — sem isso o Excel abre
 * a coluna com números soltos, sem "R$" nem separador de milhar. */
const FORMATO_MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

export type Linha = (string | number)[];

function linhaValor(rotulo: string, valor: number): Linha {
  return [rotulo, "", "", "", "", valor];
}

export function construirLinhasDre(dre: Dre): Linha[] {
  const linhas: Linha[] = [];

  linhas.push(["FATURAMENTO BRUTO"]);
  for (const f of dre.faturamento) linhas.push(linhaValor(f.rotulo, f.valor));
  if (dre.faturamento.length === 0) linhas.push(linhaValor("Nenhuma receita na competência", 0));
  linhas.push(linhaValor("Total Geral", dre.receitaTotal));
  linhas.push([]);

  linhas.push([...CABECALHO_DESPESAS]);
  for (const grupo of dre.grupos) {
    for (const l of grupo.lancamentos) {
      linhas.push([
        formatDate(l.data),
        grupo.categoriaFinanceira,
        grupo.classificacao,
        l.favorecido,
        l.descricao,
        l.valor,
      ]);
    }
    // O subtotal não repete o rótulo da classificação — é exatamente como a
    // planilha de origem fecha cada grupo, e é o que faz o contador
    // reconhecer o arquivo de bater o olho.
    linhas.push(["", "", "", "", "", grupo.total]);
    linhas.push([]);
  }

  linhas.push(linhaValor("RECEITAS", dre.receitaTotal));
  linhas.push(linhaValor("DESPESAS", dre.despesaTotal));
  linhas.push(linhaValor("LUCRO/PREJUÍZO APURADO", dre.resultado));

  return linhas;
}

function construirPlanilha(dre: Dre): XLSX.WorkBook {
  const linhas = construirLinhasDre(dre);
  const ws = XLSX.utils.aoa_to_sheet(linhas);

  // Moeda em toda célula da coluna F que carrega um número — faturamento,
  // cada lançamento, cada subtotal e as três linhas do fecho passam todas
  // por aqui, sem precisar marcar uma a uma no laço acima.
  for (let i = 0; i < linhas.length; i++) {
    const endereco = XLSX.utils.encode_cell({ r: i, c: 5 });
    const celula = ws[endereco];
    if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
  }

  ws["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 34 }, { wch: 30 }, { wch: 32 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet 1");
  return wb;
}

/** Gera o arquivo e dispara o download no navegador. */
export function baixarPlanilhaDre(dre: Dre, nomeArquivo: string): void {
  XLSX.writeFile(construirPlanilha(dre), nomeArquivo);
}

/** "2026-07" → "07-26", o padrão de nome que os arquivos da holding já usam
 * ("DRE - Laguna 07-26.xlsx"). */
export function competenciaCurta(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${m}-${ano.slice(2)}`;
}
