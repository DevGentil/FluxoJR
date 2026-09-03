import { prisma } from "@/lib/prisma";

/** O DRE no formato que a holding já usa.
 *
 * A planilha que a contabilidade recebe hoje tem três partes, nesta ordem:
 *
 * 1. **Faturamento bruto**, quebrado por tipo de receita, com o total geral.
 * 2. **Despesas analíticas**, agrupadas por classificação financeira — cada
 *    grupo lista lançamento a lançamento (data, categoria, classificação,
 *    favorecido, descrição, valor) e fecha com um subtotal.
 * 3. **O fecho**: receitas, despesas e lucro/prejuízo apurado.
 *
 * O vocabulário do sistema mapeia direto no da planilha: o centro de custo da
 * categoria é a "Categoria Financeira" (Administrativas, Funcionários,
 * Impostos…) e o nome da categoria é a "Classificação Financeira" (Software,
 * Vale Transporte, FGTS…). Foi por isso que o agrupamento saiu assim, e não
 * por preferência de layout: é a hierarquia que o contador já lê.
 *
 * O DRE é sempre de UMA competência mensal, porque é essa a unidade em que a
 * planilha é fechada e entregue. */

export interface LancamentoDre {
  id: string;
  data: Date;
  favorecido: string;
  descricao: string;
  valor: number;
}

export interface GrupoDre {
  /** "Software", "Vale Transporte" — o nome da categoria no sistema. */
  classificacao: string;
  /** "Administrativas", "Funcionários" — o centro de custo. */
  categoriaFinanceira: string;
  lancamentos: LancamentoDre[];
  total: number;
}

export interface LinhaFaturamento {
  rotulo: string;
  valor: number;
}

export interface Dre {
  /** "2026-07" */
  mes: string;
  faturamento: LinhaFaturamento[];
  receitaTotal: number;
  grupos: GrupoDre[];
  despesaTotal: number;
  /** Positivo é lucro; negativo, prejuízo. */
  resultado: number;
  /** Quantos lançamentos entraram no analítico. */
  quantidade: number;
}

/** Onde vai o que não tem centro de custo nem categoria.
 *
 * Ter um balde nomeado é melhor do que somar em silêncio numa linha
 * qualquer: quem lê o DRE precisa ver que existe algo a classificar, e
 * quanto. */
const SEM_CLASSIFICACAO = "Sem classificação";
const SEM_CATEGORIA_FINANCEIRA = "A classificar";

export function limitesDoMes(mes: string): { inicio: Date; fim: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(mes)) return null;
  const [ano, m] = mes.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return {
    inicio: new Date(Date.UTC(ano, m - 1, 1)),
    fim: new Date(Date.UTC(ano, m, 0, 23, 59, 59, 999)),
  };
}

const vazio = (mes: string): Dre => ({
  mes,
  faturamento: [],
  receitaTotal: 0,
  grupos: [],
  despesaTotal: 0,
  resultado: 0,
  quantidade: 0,
});

export async function montarDre(companyIds: string[], mes: string): Promise<Dre> {
  const periodo = limitesDoMes(mes);
  if (!periodo || companyIds.length === 0) return vazio(mes);

  const transacoes = await prisma.transaction.findMany({
    where: {
      companyId: { in: companyIds },
      date: { gte: periodo.inicio, lte: periodo.fim },
      // Transferência entre empresas do grupo não é faturamento nem despesa:
      // o dinheiro só mudou de bolso dentro da mesma casa. É a mesma regra
      // que o Balanço Executivo já aplica.
      transferCompanyId: null,
    },
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      type: true,
      category: { select: { name: true, costCenter: true } },
      supplier: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  const receitaPorTipo = new Map<string, number>();
  const porClassificacao = new Map<string, GrupoDre>();
  let receitaTotal = 0;
  let despesaTotal = 0;

  for (const t of transacoes) {
    const valor = Number(t.amount);

    if (t.type === "INCOME") {
      const rotulo = t.category?.name ?? SEM_CLASSIFICACAO;
      receitaPorTipo.set(rotulo, (receitaPorTipo.get(rotulo) ?? 0) + valor);
      receitaTotal += valor;
      continue;
    }

    const classificacao = t.category?.name ?? SEM_CLASSIFICACAO;
    const grupo = porClassificacao.get(classificacao) ?? {
      classificacao,
      categoriaFinanceira: t.category?.costCenter || SEM_CATEGORIA_FINANCEIRA,
      lancamentos: [],
      total: 0,
    };
    grupo.lancamentos.push({
      id: t.id,
      data: t.date,
      favorecido: t.supplier?.name ?? "—",
      descricao: t.description,
      valor,
    });
    grupo.total += valor;
    porClassificacao.set(classificacao, grupo);
    despesaTotal += valor;
  }

  // Faturamento do maior para o menor: o DRE abre dizendo de onde vem o
  // dinheiro, e a primeira linha deve ser a que mais pesa.
  const faturamento = [...receitaPorTipo.entries()]
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor);

  // As despesas, em ordem alfabética de classificação — é assim que a
  // planilha chega ao contador, e é o que permite comparar dois meses lado a
  // lado sem procurar onde cada rubrica foi parar.
  const grupos = [...porClassificacao.values()].sort((a, b) =>
    a.classificacao.localeCompare(b.classificacao, "pt-BR")
  );

  return {
    mes,
    faturamento,
    receitaTotal,
    grupos,
    despesaTotal,
    resultado: receitaTotal - despesaTotal,
    quantidade: transacoes.length,
  };
}
