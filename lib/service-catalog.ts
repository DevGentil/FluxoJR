/** Vocabulário do catálogo de serviços: as categorias, os convênios e como
 * cada um se chama na tela.
 *
 * Mora em `lib/` porque é domínio, não interface. Antes as constantes
 * estavam em `operacao/service-items.ts` e os rótulos dentro de um Client
 * Component (`service-item-form-dialog.tsx`) — o que fez a ficha do médico
 * e a lista de médicos redeclararem os mesmos textos, cada uma com a sua
 * variação. Três cópias de "Procedimento" é uma a mais do que o número de
 * vezes que alguém vai lembrar de atualizar as três. */

export const SERVICE_CATEGORIES = ["CONSULTA", "EXAME", "PROCEDIMENTO", "PLANTAO", "OUTRO"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const PAYERS = ["CT", "PARTICULAR"] as const;
export type Payer = (typeof PAYERS)[number];

/** Valor do select quando o item não tem convênio (plantão, auxílio). O
 * Select do Base UI não lida bem com string vazia, então usa um sentinel. */
export const NO_PAYER = "NONE";

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  CONSULTA: "Consulta",
  EXAME: "Exame",
  PROCEDIMENTO: "Procedimento",
  PLANTAO: "Plantão",
  OUTRO: "Outro",
};

export const PAYER_LABELS: Record<Payer, string> = {
  CT: "Cartão de Todos",
  PARTICULAR: "Particular",
};

/** Etiqueta curta para o convênio, onde a coluna é estreita. */
export const PAYER_SHORT: Record<Payer, string> = {
  CT: "CT",
  PARTICULAR: "Part",
};

/** O rótulo da categoria, aceitando a string crua que vem do banco. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ServiceCategory] ?? category;
}

/** Em minúscula, para entrar no meio de uma frase — "3 itens · consulta,
 * exame". Derivado do rótulo, para não virar uma segunda lista de nomes. */
export function categoryLabelInline(category: string): string {
  return categoryLabel(category).toLowerCase();
}

export function payerLabel(payer: string | null): string | null {
  return payer ? (PAYER_LABELS[payer as Payer] ?? payer) : null;
}
