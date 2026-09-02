"use client";

import { useEffect, useRef } from "react";
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
 * menu de 16rem e a tabela caberem juntos. O resultado era conteúdo
 * cortado — sumia o botão de importar, sumia parte da tabela.
 *
 * Reage só à TRAVESSIA do limite. Isso não é detalhe: `setOpen` do
 * SidebarProvider é um `useCallback` que depende do próprio `open`, então
 * ele troca de identidade a cada clique no botão de recolher. Um efeito
 * que dependesse dele rodaria de novo a cada clique e reabriria o menu na
 * hora — o botão parecia morto em tela cheia. Guardando o setter num ref,
 * o efeito assina o `matchMedia` uma vez e só age quando a largura de
 * fato cruza o limite; dentro da faixa a pessoa continua livre para abrir
 * e fechar na mão. */
export function SidebarAutoRecolher() {
  const { setOpen } = useSidebar();

  // O ref segura sempre a versão mais nova sem entrar nas dependências do
  // efeito que assina o `matchMedia`. A atribuição vai num efeito próprio
  // porque escrever em ref durante o render é leitura de valor mutável no
  // meio da renderização — o React não garante quando isso acontece.
  const aplicarRef = useRef(setOpen);
  useEffect(() => {
    aplicarRef.current = setOpen;
  }, [setOpen]);

  useEffect(() => {
    const mql = window.matchMedia(LARGURA_APERTADA);
    const aoMudar = () => aplicarRef.current(!mql.matches);

    aoMudar();
    mql.addEventListener("change", aoMudar);
    return () => mql.removeEventListener("change", aoMudar);
  }, []);

  return null;
}
