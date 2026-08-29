import { computeMargin, type TaxBracketInput } from "./service-margin";

/** Aceita tanto `number` quanto o `Decimal` do Prisma. */
type DecimalLike = { toString(): string };

export interface PeriodLine {
  quantity: DecimalLike;
  rate: DecimalLike;
  serviceItem: {
    category: string;
    /** Nulo em item que não gera receita direta (plantão, auxílio) ou que
     * ainda não teve o preço preenchido. */
    price: DecimalLike | null;
    operationalCost: DecimalLike;
  };
}

/** Um dia de trabalho lançado. O valor vem de `amount` (digitado direto,
 * como nas planilhas) ou das linhas detalhadas — nunca dos dois. */
export interface DailyEntry {
  amount: DecimalLike | null;
  lines: PeriodLine[];
}

export interface PeriodTotals {
  consultationCount: number;
  consultationValue: number;
  examCount: number;
  examValue: number;
  hoursWorked: number | null;
  hourlyValue: number;
  otherValue: number;
  /** Repasse total do médico no período — o custo de verdade. */
  totalValue: number;
  /** Parte do repasse que veio de lançamento sem detalhe por item. Não dá
   * para dizer se foi consulta ou exame, então não entra nas contagens. */
  undetailedValue: number;
  revenue: number;
  tax: number;
  operationalCost: number;
  /** Repasse de itens sem preço, fora do cálculo de margem. */
  unpricedCost: number;
  profit: number;
}

function emptyTotals(): PeriodTotals {
  return {
    consultationCount: 0,
    consultationValue: 0,
    examCount: 0,
    examValue: 0,
    hoursWorked: null,
    hourlyValue: 0,
    otherValue: 0,
    totalValue: 0,
    undetailedValue: 0,
    revenue: 0,
    tax: 0,
    operationalCost: 0,
    unpricedCost: 0,
    profit: 0,
  };
}

/** Consolida um conjunto de lançamentos diários nas grandezas das métricas.
 *
 * O que separa consulta de exame de plantão é a categoria do item do
 * catálogo. PROCEDIMENTO conta junto de EXAME na conversão: o que importa é
 * quantas consultas viraram um serviço vendido.
 *
 * Lançamento sem detalhe (só o valor do dia, como 98% das planilhas reais)
 * entra no custo por `undetailedValue`, mas fica fora das contagens e da
 * margem — não há como saber o que foi feito nem a que preço foi cobrado.
 *
 * A margem compara apenas o que é comparável: receita e repasse do MESMO
 * conjunto de itens. Item sem preço fica de fora dos dois lados. */
export function summarizeDailyEntries(entries: DailyEntry[], brackets: TaxBracketInput[]): PeriodTotals {
  const t = emptyTotals();
  let plantaoQuantity = 0;
  let pricedCost = 0;

  for (const entry of entries) {
    if (entry.lines.length === 0) {
      t.undetailedValue += Number(entry.amount ?? 0);
      continue;
    }

    for (const l of entry.lines) {
      const quantity = Number(l.quantity);
      const value = quantity * Number(l.rate);

      switch (l.serviceItem.category) {
        case "CONSULTA":
          t.consultationCount += quantity;
          t.consultationValue += value;
          break;
        case "EXAME":
        case "PROCEDIMENTO":
          t.examCount += quantity;
          t.examValue += value;
          break;
        case "PLANTAO":
          plantaoQuantity += quantity;
          t.hourlyValue += value;
          break;
        default:
          t.otherValue += value;
      }

      const price = l.serviceItem.price != null ? Number(l.serviceItem.price) : null;
      const perUnit =
        price != null && price > 0
          ? computeMargin({
              price,
              doctorRate: Number(l.rate),
              operationalCost: Number(l.serviceItem.operationalCost),
              brackets,
            })
          : null;

      if (perUnit) {
        t.revenue += quantity * perUnit.price;
        pricedCost += value;
        t.tax += quantity * perUnit.tax;
        t.operationalCost += quantity * perUnit.operationalCost;
      } else {
        t.unpricedCost += value;
      }
    }
  }

  t.hoursWorked = plantaoQuantity > 0 ? plantaoQuantity : null;
  t.totalValue =
    t.consultationValue + t.examValue + t.hourlyValue + t.otherValue + t.undetailedValue;
  t.profit = t.revenue - pricedCost - t.tax - t.operationalCost;
  return t;
}

/** Só o que é preciso para chegar ao valor do dia — quem quer apenas o
 * total não precisa carregar o item do catálogo de cada linha. */
export interface EntryValue {
  amount: DecimalLike | null;
  lines: { quantity: DecimalLike; rate: DecimalLike }[];
}

/** Valor de um único lançamento: o digitado ou a soma das linhas. É a
 * mesma conta que a planilha faz na coluna "Valor". */
export function entryAmount(entry: EntryValue): number {
  if (entry.lines.length === 0) return Number(entry.amount ?? 0);
  return entry.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.rate), 0);
}
