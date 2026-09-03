"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { presetRange, type PeriodoPreset } from "@/lib/date-only";

const ATALHOS: { label: string; kind: PeriodoPreset }[] = [
  { label: "Hoje", kind: "today" },
  { label: "Esta semana", kind: "week" },
  { label: "Este mês", kind: "month" },
  { label: "Mês passado", kind: "lastMonth" },
];

interface Props {
  basePath: string;
  /** Os parâmetros atuais da URL — os atalhos preservam todos, exceto os
   * dois campos de data (que eles mesmos definem) e o que vier em
   * `excluir`. */
  params: Record<string, string | undefined>;
  /** Nome dos campos de início e fim nesta tela — "de"/"ate" nas telas que
   * usam `FiltrosTabela`, "from"/"to" em Transações. */
  campoDe: string;
  campoAte: string;
  /** Parâmetros que não devem seguir para o período novo: paginação, e
   * atalhos de navegação como o `ver` do Fechamento de Caixa, que só fazem
   * sentido na página em que a pessoa já estava. */
  excluir?: string[];
}

/** Os quatro atalhos de período — Hoje, Esta semana, Este mês, Mês passado —
 * ao lado do filtro de data que cada tela já tem.
 *
 * Mesmo par de nomes de campo que `PeriodFilter` usa em Relatórios e
 * Balanço, e o mesmo motivo para navegar com `router.push` + `router.refresh`
 * em vez de um `<Link>` puro: nesta versão do Next.js, trocar só a query
 * string às vezes reaproveitava o cache do cliente e não buscava os dados
 * novos do servidor. */
export function AtalhosPeriodo({ basePath, params, campoDe, campoAte, excluir = [] }: Props) {
  const router = useRouter();

  function irPara(kind: PeriodoPreset) {
    const range = presetRange(kind);
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      if (!valor) continue;
      if (chave === campoDe || chave === campoAte) continue;
      if (excluir.includes(chave)) continue;
      query.set(chave, valor);
    }
    query.set(campoDe, range.from);
    query.set(campoAte, range.to);
    router.push(`${basePath}?${query.toString()}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ATALHOS.map((atalho) => {
        const range = presetRange(atalho.kind);
        const ativo = params[campoDe] === range.from && params[campoAte] === range.to;
        return (
          <Button
            key={atalho.label}
            type="button"
            size="sm"
            variant={ativo ? "default" : "outline"}
            onClick={() => irPara(atalho.kind)}
          >
            {atalho.label}
          </Button>
        );
      })}
    </div>
  );
}
