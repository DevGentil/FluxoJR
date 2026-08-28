/** Cálculo de margem de um item do catálogo, replicando a conta que a
 * planilha de exames faz em cada linha:
 *
 *   Lucro previsto = Valor Total − Repasse − Taxas − Custo operacional
 *
 * A diferença é que aqui o lucro é sempre derivado, nunca digitado — na
 * planilha ele era uma coluna calculada que saiu de sincronia (a coluna
 * "% do Repasse" ficou desalinhada em 109 das 211 linhas depois de uma
 * ordenação). E o repasse usado é o do médico que atendeu, não um valor
 * de referência: o mesmo procedimento pode dar lucro com um médico e
 * prejuízo com outro.
 */

export interface TaxBracketInput {
  minValue: number;
  /** Nulo = faixa sem teto. */
  maxValue: number | null;
  percent: number;
}

function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Percentual de taxa aplicado a um valor, conforme a faixa em que ele cai.
 * Sem faixa correspondente (ou sem faixas cadastradas) devolve 0 — a tela
 * avisa que faltam faixas em vez de inventar um número. */
export function taxPercentFor(price: number, brackets: TaxBracketInput[]): number {
  const hit = brackets.find(
    (b) => price >= b.minValue && (b.maxValue == null || price <= b.maxValue)
  );
  return hit ? hit.percent : 0;
}

export interface MarginInput {
  /** Valor cobrado do paciente. Nulo em item que não gera receita direta
   * (plantão, auxílio) — nesse caso não há margem a calcular. */
  price: number | null;
  /** Repasse do médico que atendeu. */
  doctorRate: number;
  operationalCost: number;
  brackets: TaxBracketInput[];
}

export interface Margin {
  price: number;
  doctorRate: number;
  taxPercent: number;
  tax: number;
  operationalCost: number;
  profit: number;
  /** Lucro sobre o valor cobrado. */
  marginPercent: number;
  /** Quanto do valor cobrado vai para o médico. */
  doctorSharePercent: number;
}

/** Margem de um item para um repasse específico. Devolve null quando o item
 * não tem preço (não há receita para comparar). */
export function computeMargin({
  price,
  doctorRate,
  operationalCost,
  brackets,
}: MarginInput): Margin | null {
  if (price == null || price <= 0) return null;

  const taxPercent = taxPercentFor(price, brackets);
  const tax = round2((price * taxPercent) / 100);
  const profit = round2(price - doctorRate - tax - operationalCost);

  return {
    price,
    doctorRate,
    taxPercent,
    tax,
    operationalCost,
    profit,
    marginPercent: round2((profit / price) * 100),
    doctorSharePercent: round2((doctorRate / price) * 100),
  };
}
