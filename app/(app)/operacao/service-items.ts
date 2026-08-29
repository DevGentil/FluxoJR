/** Constantes e tipos do catálogo de serviços.
 *
 * Ficam fora de service-items-actions.ts porque um arquivo "use server" só
 * pode exportar funções async — constantes ali quebram o build do Next. */

export const SERVICE_CATEGORIES = ["CONSULTA", "EXAME", "PROCEDIMENTO", "PLANTAO", "OUTRO"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const PAYERS = ["CT", "PARTICULAR"] as const;
export type Payer = (typeof PAYERS)[number];

/** Valor do select quando o item não tem convênio (plantão, auxílio). O
 * Select do Base UI não lida bem com string vazia, então usa um sentinel. */
export const NO_PAYER = "NONE";
