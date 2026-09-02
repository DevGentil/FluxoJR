/** Dias a partir dos quais um registro de erro é considerado antigo.
 *
 * Um mês cobre o intervalo em que ainda se pergunta "o que aconteceu
 * naquele dia?". Passado isso, o registro só ocupa espaço e esconde o que
 * é recente.
 *
 * Fica fora de `actions.ts` porque arquivo com `"use server"` só pode
 * exportar função assíncrona — o build do Next recusa a constante ali, e
 * tanto a action quanto o botão precisam deste número. */
export const DIAS_ANTIGO = 30;
