"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { Sort, SortDirection } from "@/lib/sorting";

/** Cabeçalho de coluna que ordena a tabela.
 *
 * Vem em duas versões porque a ordem precisa morar em lugares diferentes:
 *
 * - `SortableHead` guarda na URL. É o certo para tabela que pagina no
 *   servidor. Ordenar no cliente ali reordenaria só as 20 linhas abertas e
 *   mostraria "o maior valor" que na verdade é o maior daquela página — um
 *   número errado com cara de certo. Com a ordem no endereço quem ordena é
 *   a consulta, e a página volta ao começo. De brinde, a escolha sobrevive
 *   ao recarregar e cabe num link.
 * - `LocalSortableHead` guarda em `useState`. É o certo para tabela cujo
 *   conjunto inteiro já está no navegador e que já tem estado local (busca,
 *   granularidade, linhas expandidas) — pôr só a ordem na URL espalharia o
 *   estado da mesma tela por dois lugares sem ganho nenhum.
 *
 * As duas desenham a mesma coisa. */

interface VisualProps {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
  /** Direção do PRIMEIRO clique. Nome e texto começam crescente; dinheiro,
   * data e contagem começam decrescente, que é o que se quer ver primeiro
   * ("quem custou mais", "o mais recente"). */
  first?: SortDirection;
  /** O que exatamente a ordem reordena, quando não for a tabela inteira —
   * numa tabela agrupada, por exemplo, só as linhas de dentro do grupo. */
  hint?: string;
}

function HeadButton({
  children,
  align = "left",
  className,
  hint,
  active,
  dir,
  onSort,
  proximaOrdem,
}: VisualProps & {
  active: boolean;
  dir: SortDirection;
  onSort: () => void;
  proximaOrdem: string;
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      // `aria-sort` é como o leitor de tela anuncia por qual coluna a tabela
      // está ordenada — sem ele a seta é decoração invisível.
      aria-sort={!active ? "none" : dir === "asc" ? "ascending" : "descending"}
      className={className}
    >
      <button
        type="button"
        onClick={onSort}
        title={`Ordenar ${hint ?? ""} (${proximaOrdem})`.replace(/\s+/g, " ")}
        className={`group inline-flex w-full items-center gap-1 rounded-sm font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          align === "right" ? "justify-end" : "justify-start"
        } ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {children}
        <Icon
          className={`size-3.5 shrink-0 transition-opacity ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60"
          }`}
          aria-hidden
        />
      </button>
    </TableHead>
  );
}

function proximaOrdemLabel(active: boolean, dir: SortDirection, first: SortDirection) {
  const proxima = active ? (dir === "asc" ? "desc" : "asc") : first;
  return proxima === "asc" ? "crescente" : "decrescente";
}

interface UrlProps extends VisualProps {
  field: string;
  /** Prefixo dos parâmetros, para duas tabelas ordenáveis na mesma tela.
   * Com `prefix="m"` os parâmetros viram `msort` e `mdir`. */
  prefix?: string;
  /** A ordem que a página de fato aplicou, saída do `parseSort` dela.
   *
   * Passe sempre que a tela tiver ordem padrão. Sem isso, a marcação sai do
   * que está na URL — e no primeiro acesso, com a URL limpa, nenhuma coluna
   * apareceria marcada mesmo com a tabela ordenada por uma delas. A tabela
   * pareceria não ter ordem nenhuma, que é justamente a impressão errada. */
  current?: Sort<string>;
}

/** Ordem na URL — para tabela que pagina no servidor. */
export function SortableHead({ field, prefix = "", first = "asc", current, ...visual }: UrlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sortKey = `${prefix}sort`;
  const dirKey = `${prefix}dir`;
  const active = current ? current.field === field : searchParams.get(sortKey) === field;
  const dir: SortDirection = current
    ? current.dir
    : searchParams.get(dirKey) === "desc"
      ? "desc"
      : "asc";

  function handleSort() {
    const next = new URLSearchParams(searchParams);
    next.set(sortKey, field);
    next.set(dirKey, active ? (dir === "asc" ? "desc" : "asc") : first);
    // Trocar a ordem invalida a página aberta: a página 3 da ordem antiga
    // não tem relação com a página 3 da nova. Só a paginação DESTA tabela
    // volta ao começo — ordenar uma tabela não mexe na vizinha.
    next.delete(`${prefix}page`);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <HeadButton
      {...visual}
      active={active}
      dir={dir}
      onSort={handleSort}
      proximaOrdem={proximaOrdemLabel(active, dir, first)}
    />
  );
}

/** Estado de ordenação local, para tabela que já tem o conjunto inteiro
 * no navegador. Espelha a API de `SortableHead`: o primeiro clique numa
 * coluna nova usa o `first` dela; os seguintes invertem. */
export function useLocalSort<T extends string>(inicial: Sort<T>) {
  const [sort, setSort] = useState<Sort<T>>(inicial);

  function onSort(field: T, first: SortDirection) {
    setSort((atual) =>
      atual.field === field
        ? { field, dir: atual.dir === "asc" ? "desc" : "asc" }
        : { field, dir: first }
    );
  }

  return { sort, onSort };
}

interface LocalProps<T extends string> extends VisualProps {
  field: T;
  sort: Sort<T>;
  onSort: (field: T, first: SortDirection) => void;
}

/** Ordem em `useState` — para tabela sem paginação de servidor. */
export function LocalSortableHead<T extends string>({
  field,
  sort,
  onSort,
  first = "asc",
  ...visual
}: LocalProps<T>) {
  const active = sort.field === field;

  return (
    <HeadButton
      {...visual}
      active={active}
      dir={sort.dir}
      onSort={() => onSort(field, first)}
      proximaOrdem={proximaOrdemLabel(active, sort.dir, first)}
    />
  );
}
