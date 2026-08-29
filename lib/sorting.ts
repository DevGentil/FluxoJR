/** Ordenação vinda da URL (`?sort=nome&dir=desc`).
 *
 * A lista de campos permitidos é obrigatória e existe por segurança: o valor
 * chega da barra de endereço, e passar isso direto para o `orderBy` do Prisma
 * ou para um acesso a propriedade deixaria o usuário escolher por qual coluna
 * — inclusive uma que a tela não mostra — ordenar. Fora da lista, cai no
 * padrão da tela em vez de errar. */

export type SortDirection = "asc" | "desc";

export interface Sort<T extends string> {
  field: T;
  dir: SortDirection;
}

export function parseSort<T extends string>(
  params: { sort?: string; dir?: string },
  allowed: readonly T[],
  fallback: Sort<T>
): Sort<T> {
  const field = allowed.includes(params.sort as T) ? (params.sort as T) : fallback.field;
  // A direção só é respeitada junto de um campo válido — senão inverter a
  // ordem padrão dependeria de um parâmetro solto na URL.
  const dir: SortDirection =
    field === params.sort ? (params.dir === "desc" ? "desc" : "asc") : fallback.dir;
  return { field, dir };
}

/** Comparador para ordenar em memória.
 *
 * Texto compara com `localeCompare` em pt-BR — sem isso "Ávila" cairia
 * depois de "Zanetti", porque a comparação bruta usa o código do caractere.
 * Nulo vai sempre para o fim, nas duas direções: uma linha sem valor não é
 * "a menor", é "sem resposta", e deixá-la no topo do decrescente esconde as
 * que interessam. */
export function compareBy<T>(
  a: T,
  b: T,
  pick: (row: T) => string | number | Date | null | undefined,
  dir: SortDirection
): number {
  const va = pick(a);
  const vb = pick(b);

  const vazioA = va === null || va === undefined || va === "";
  const vazioB = vb === null || vb === undefined || vb === "";
  if (vazioA && vazioB) return 0;
  if (vazioA) return 1;
  if (vazioB) return -1;

  const sinal = dir === "asc" ? 1 : -1;

  if (typeof va === "string" && typeof vb === "string") {
    return va.localeCompare(vb, "pt-BR") * sinal;
  }
  const na = va instanceof Date ? va.getTime() : Number(va);
  const nb = vb instanceof Date ? vb.getTime() : Number(vb);
  return (na - nb) * sinal;
}

/** Ordena uma cópia da lista — não mexe na original. */
export function sortBy<T>(
  rows: readonly T[],
  pick: (row: T) => string | number | Date | null | undefined,
  dir: SortDirection
): T[] {
  return [...rows].sort((a, b) => compareBy(a, b, pick, dir));
}
