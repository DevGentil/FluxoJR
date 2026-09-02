"use client";

import { useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";

/** Abaixo desta largura o menu vira barra de ícones.
 *
 * O valor não é redondo por acaso: com o menu aberto (16rem) sobram menos
 * de 800px de conteúdo, e é aí que as tabelas começam a ser cortadas. */
const LARGURA_APERTADA = "(max-width: 1100px)";

/** Recolhe o menu sozinho quando a janela aperta, e devolve quando sobra
 * espaço.
 *
 * Entre 768px e ~1100px existia uma faixa cega: larga demais para o menu
 * virar gaveta (isso só acontece abaixo de 768), estreita demais para o
 * menu de 16rem e a tabela caberem juntos. O resultado era o conteúdo
 * cortado — sumia o botão de importar, sumia parte da tabela.
 *
 * Só reage à TRAVESSIA do limite, não a cada render: dentro da faixa a
 * pessoa continua podendo abrir o menu na mão sem ele fechar de novo
 * sozinho. */
export function SidebarAutoRecolher() {
  const { setOpen } = useSidebar();

  useEffect(() => {
    const mql = window.matchMedia(LARGURA_APERTADA);
    const aplicar = () => setOpen(!mql.matches);

    aplicar();
    mql.addEventListener("change", aplicar);
    return () => mql.removeEventListener("change", aplicar);
  }, [setOpen]);

  return null;
}
