"use client";

import { ArrowLeft, Printer } from "lucide-react";

/** A barra que existe na tela e some no papel.
 *
 * Não dispara a impressão sozinha ao abrir: quem gera um documento para
 * mandar ao médico quer olhar antes, e um diálogo de impressão que salta na
 * cara faz a pessoa fechar por reflexo sem ter conferido nada. */
export function BotoesDemonstrativo() {
  return (
    <div className="barra">
      <button type="button" onClick={() => history.back()} className="acao">
        <ArrowLeft className="size-4" />
        Voltar
      </button>
      <button type="button" onClick={() => window.print()} className="acao primaria">
        <Printer className="size-4" />
        Imprimir ou salvar em PDF
      </button>
    </div>
  );
}
