"use client";

import { useRef, type ReactNode } from "react";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";

/** O menu, que se abre ao passar o mouse e volta a fechar ao sair.
 *
 * Recolhido, o menu mostra só ícones — o que é bom para o espaço e ruim
 * para quem ainda não decorou qual ícone é qual. Abrir no hover devolve os
 * nomes sem custo de clique e sem tirar o espaço de volta quando o
 * ponteiro sai.
 *
 * Só desfaz o que ELE mesmo fez: se o menu já estava aberto quando o mouse
 * chegou, sair não fecha. Sem essa marca, passar o mouse por cima de um
 * menu que a pessoa abriu de propósito o fecharia ao sair — o oposto do
 * que ela pediu ao clicar no botão.
 *
 * No celular não faz nada: lá o menu é gaveta e não existe hover. */
export function SidebarExpansivel({ children }: { children: ReactNode }) {
  const { state, setOpen, isMobile } = useSidebar();
  const abriuPorHover = useRef(false);

  function aoEntrar() {
    if (isMobile || state !== "collapsed") return;
    abriuPorHover.current = true;
    setOpen(true);
  }

  function aoSair() {
    if (!abriuPorHover.current) return;
    abriuPorHover.current = false;
    setOpen(false);
  }

  return (
    <Sidebar collapsible="icon" onMouseEnter={aoEntrar} onMouseLeave={aoSair}>
      {children}
    </Sidebar>
  );
}
