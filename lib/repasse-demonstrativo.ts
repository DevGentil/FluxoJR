import { CATEGORY_LABELS, SERVICE_CATEGORIES, type ServiceCategory } from "./service-catalog";

/** O detalhe de um repasse: o que foi feito, quanto de cada coisa, a que
 * valor combinado.
 *
 * Existe separado da tela porque duas coisas muito diferentes precisam da
 * mesma conta: o detalhe que abre ao clicar num lançamento e o demonstrativo
 * que vai impresso para o médico conferir. Se cada um somasse por conta
 * própria, um dia a tela diria 39 consultas e o papel diria 38 — e a conversa
 * com o médico passaria a ser sobre qual dos dois está certo.
 *
 * Tudo aqui é função pura sobre linhas já carregadas: sem Prisma, sem
 * formatação, sem relógio. */

/** Aceita tanto `number` quanto o `Decimal` do Prisma. */
type DecimalLike = { toString(): string };

export interface LinhaCrua {
  quantity: DecimalLike;
  rate: DecimalLike;
  serviceItem: { name: string; category: string };
}

export interface ItemDetalhe {
  item: string;
  quantidade: number;
  /** Valor combinado por unidade, congelado no dia do lançamento. */
  taxa: number;
  subtotal: number;
}

export interface GrupoDetalhe {
  categoria: ServiceCategory;
  rotulo: string;
  itens: ItemDetalhe[];
  /** Quantas unidades no grupo — "39 consultas", "21 exames". */
  quantidade: number;
  total: number;
}

/** Ordem de exibição das categorias.
 *
 * Segue `SERVICE_CATEGORIES`, que é a ordem em que a operação fala do
 * trabalho: consulta primeiro, porque é o que traz o paciente; exame e
 * procedimento depois, porque decorrem dela. */
const ORDEM = SERVICE_CATEGORIES;

function categoriaValida(bruta: string): ServiceCategory {
  return (ORDEM as readonly string[]).includes(bruta) ? (bruta as ServiceCategory) : "OUTRO";
}

/** Junta linhas em grupos por categoria, somando itens repetidos.
 *
 * Itens repetidos existem de verdade: o mesmo exame lançado em dois dias
 * diferentes vira duas linhas, e no consolidado do mês elas têm que virar
 * uma só — com a soma das quantidades. Duas linhas do mesmo item com taxas
 * diferentes (um reajuste no meio do mês) permanecem separadas, porque
 * misturá-las esconderia o reajuste justamente de quem precisa conferi-lo. */
export function agruparPorCategoria(linhas: LinhaCrua[]): GrupoDetalhe[] {
  const porCategoria = new Map<ServiceCategory, Map<string, ItemDetalhe>>();

  for (const linha of linhas) {
    const categoria = categoriaValida(linha.serviceItem.category);
    const quantidade = Number(linha.quantity);
    const taxa = Number(linha.rate);
    // A chave inclui a taxa: mesmo item a preços diferentes são duas linhas.
    const chave = `${linha.serviceItem.name}|${taxa}`;

    const itens = porCategoria.get(categoria) ?? new Map<string, ItemDetalhe>();
    const atual = itens.get(chave);
    if (atual) {
      atual.quantidade += quantidade;
      atual.subtotal += quantidade * taxa;
    } else {
      itens.set(chave, {
        item: linha.serviceItem.name,
        quantidade,
        taxa,
        subtotal: quantidade * taxa,
      });
    }
    porCategoria.set(categoria, itens);
  }

  return ORDEM.filter((c) => porCategoria.has(c)).map((categoria) => {
    const itens = [...porCategoria.get(categoria)!.values()].sort((a, b) =>
      a.item.localeCompare(b.item, "pt-BR")
    );
    return {
      categoria,
      rotulo: CATEGORY_LABELS[categoria],
      itens,
      quantidade: itens.reduce((s, i) => s + i.quantidade, 0),
      total: itens.reduce((s, i) => s + i.subtotal, 0),
    };
  });
}

export interface Demonstrativo {
  grupos: GrupoDetalhe[];
  /** Soma das linhas detalhadas. */
  totalDetalhado: number;
  /** Soma dos lançamentos que vieram só como "valor do dia", sem itens.
   *
   * Fica separado, e não escondido dentro do total, porque é a diferença
   * entre "o médico atendeu isto" e "alguém digitou este valor". Somar os
   * dois numa linha só faria o documento afirmar um detalhamento que não
   * existe. */
  totalSemDetalhe: number;
  /** Quantos lançamentos entraram sem detalhe — o que o médico vê como
   * linhas que ele não consegue conferir item a item. */
  diasSemDetalhe: number;
  total: number;
}

export interface LancamentoCru {
  amount: DecimalLike | null;
  lines: LinhaCrua[];
}

/** O demonstrativo de um conjunto de lançamentos — um dia, um mês, um ano. */
export function demonstrativoDe(lancamentos: LancamentoCru[]): Demonstrativo {
  const detalhados = lancamentos.flatMap((l) => l.lines);
  const semDetalhe = lancamentos.filter((l) => l.lines.length === 0);

  const grupos = agruparPorCategoria(detalhados);
  const totalDetalhado = grupos.reduce((s, g) => s + g.total, 0);
  const totalSemDetalhe = semDetalhe.reduce((s, l) => s + Number(l.amount ?? 0), 0);

  return {
    grupos,
    totalDetalhado,
    totalSemDetalhe,
    diasSemDetalhe: semDetalhe.length,
    total: totalDetalhado + totalSemDetalhe,
  };
}
