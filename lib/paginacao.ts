/** Quantos registros por página nas listas de cadastro e de lançamento.
 *
 * Trinta cabe numa tela de notebook sem rolagem interna e ainda deixa o
 * rodapé de paginação visível — que é o que faz a pessoa perceber que
 * existe mais coisa embaixo. */
export const POR_PAGINA = 30;

/** Para telas que empilham duas listas — a fila de aprovação de repasses,
 * com o que espera aprovação e o que já foi aprovado.
 *
 * Trinta em cada uma empurraria os lançamentos do mês para fora do campo
 * de visão, e a fila é para ser resolvida, não navegada. */
export const POR_PAGINA_COMPACTA = 10;

/** Lê o número da página da URL.
 *
 * Qualquer coisa que não seja inteiro positivo vira 1: endereço editado à
 * mão, `?page=abc` ou `?page=-2` devem abrir a primeira página, não
 * quebrar a tela nem pedir `skip: -60` ao banco. */
export function lerPagina(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Em que página cai o registro que está na posição `indice` (base zero).
 *
 * Serve para os atalhos que apontam para um registro específico — abrir um
 * fechamento a partir de Transações, por exemplo. Sem isso o atalho levaria
 * para a página 1 e o registro pedido ficaria três páginas adiante, sem
 * nenhuma pista de que ele existe. */
export function paginaDoIndice(indice: number, porPagina = POR_PAGINA): number {
  return Math.floor(indice / porPagina) + 1;
}
