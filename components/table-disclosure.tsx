"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  open: boolean;
  onToggle: () => void;
  /** Para o leitor de tela: "Agosto de 2026", "grupo US". */
  label: string;
  children: ReactNode;
}

/** O gatilho de abrir e fechar de uma linha de tabela expansível.
 *
 * Existe porque as tabelas do sistema abriam grupos com `onClick` na `<tr>`.
 * Funcionava com o mouse e com mais nada: a linha não recebe foco, não
 * responde a Enter, e um leitor de tela não tem como saber que ali há algo
 * para abrir. Eram 8 linhas assim só na tela de lançamentos.
 *
 * A `<tr>` mantém o `onClick` — clicar em qualquer lugar da linha continua
 * abrindo, que é a affordance certa para o mouse. O botão aqui dentro é o
 * que dá teclado e semântica; ele para a propagação para o clique não
 * contar duas vezes. */
export function TableDisclosure({ open, onToggle, label, children }: Props) {
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? `Fechar ${label}` : `Abrir ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex w-full items-center gap-1.5 text-left rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Icon className="size-4 text-muted-foreground shrink-0" aria-hidden />
      {children}
    </button>
  );
}
