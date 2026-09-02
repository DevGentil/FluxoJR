"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { GRAVIDADES, GRAVIDADE_ROTULO, type Gravidade } from "@/lib/erro-gravidade";

interface Props {
  /** Quantos existem de cada gravidade, com o filtro de estado aplicado. */
  contagem: Record<Gravidade, number>;
  total: number;
}

/** Filtro por gravidade e por estado, no endereço.
 *
 * Fica na URL e não em `useState` para o link ser compartilhável e a
 * paginação continuar funcionando — "página 2 dos críticos" precisa
 * sobreviver a um F5. */
export function FiltrosErros({ contagem, total }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const gravidadeAtual = params.get("gravidade");
  const estadoAtual = params.get("estado");

  /** Monta o endereço mudando UMA chave e zerando a página — filtrar e
   * continuar na página 7 mostraria uma lista vazia sem explicação. */
  function href(chave: string, valor: string | null) {
    const proximos = new URLSearchParams(params.toString());
    if (valor === null) proximos.delete(chave);
    else proximos.set(chave, valor);
    proximos.delete("page");
    const query = proximos.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const aba = (ativo: boolean) =>
    `rounded-full px-3 py-1 text-xs transition-colors ${
      ativo
        ? "bg-foreground text-background"
        : "bg-muted text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={href("gravidade", null)} className={aba(!gravidadeAtual)}>
          Todos {total}
        </Link>
        {GRAVIDADES.map((g) => (
          <Link key={g} href={href("gravidade", g)} className={aba(gravidadeAtual === g)}>
            {GRAVIDADE_ROTULO[g]} {contagem[g]}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Link href={href("estado", null)} className={aba(!estadoAtual)}>
          Todos
        </Link>
        <Link href={href("estado", "novos")} className={aba(estadoAtual === "novos")}>
          Não vistos
        </Link>
        <Link href={href("estado", "vistos")} className={aba(estadoAtual === "vistos")}>
          Vistos
        </Link>
      </div>
    </div>
  );
}
