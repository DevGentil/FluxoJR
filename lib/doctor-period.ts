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
  revenue: number;
  tax: number;
  operationalCost: number;
  /** Repasse de itens sem preço, fora do cálculo de margem. */
  unpricedCost: number;
  profit: number;
}

/** Consolida as linhas de um lançamento mensal nas grandezas das métricas.
 *
 * O que separa consulta de exame de plantão é a categoria do item do
 * catálogo, não um campo fixo — foi assim que deu para suportar médico que
 * combina os três, como as planilhas reais mostram.
 *
 * PROCEDIMENTO conta junto de EXAME na conversão: o que importa é quantas
 * consultas viraram um serviço vendido, e um procedimento vale tanto quanto
 * um exame.
 *
 * A margem compara apenas o que é comparável — receita e repasse do MESMO
 * conjunto de itens. Item sem preço fica de fora dos dois lados e é somado
 * em `unpricedCost`; senão a conta colocaria a receita de alguns itens
 * contra o custo de todos e a margem viraria um número sem sentido. */
export function summarizePeriodLines(lines: PeriodLine[], brackets: TaxBracketInput[]): PeriodTotals {
  let consultationCount = 0;
  let consultationValue = 0;
  let examCount = 0;
  let examValue = 0;
  let plantaoQuantity = 0;
  let hourlyValue = 0;
  let otherValue = 0;
  let revenue = 0;
  let tax = 0;
  let operationalCost = 0;
  let pricedCost = 0;
  let unpricedCost = 0;

  for (const l of lines) {
    const quantity = Number(l.quantity);
    const value = quantity * Number(l.rate);

    switch (l.serviceItem.category) {
      case "CONSULTA":
        consultationCount += quantity;
        consultationValue += value;
        break;
      case "EXAME":
      case "PROCEDIMENTO":
        examCount += quantity;
        examValue += value;
        break;
      case "PLANTAO":
        plantaoQuantity += quantity;
        hourlyValue += value;
        break;
      default:
        otherValue += value;
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
      revenue += quantity * perUnit.price;
      pricedCost += value;
      tax += quantity * perUnit.tax;
      operationalCost += quantity * perUnit.operationalCost;
    } else {
      unpricedCost += value;
    }
  }

  return {
    consultationCount,
    consultationValue,
    examCount,
    examValue,
    hoursWorked: plantaoQuantity > 0 ? plantaoQuantity : null,
    hourlyValue,
    otherValue,
    totalValue: consultationValue + examValue + hourlyValue + otherValue,
    revenue,
    tax,
    operationalCost,
    unpricedCost,
    profit: revenue - pricedCost - tax - operationalCost,
  };
}
