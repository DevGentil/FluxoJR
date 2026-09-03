"use client";

import { ArrowLeft, Printer } from "lucide-react";

/** A barra que existe na tela e some no papel.
 *
 * Não dispara a impressão sozinha ao abrir: quem gera um documento para
 * mandar ao contador ou à diretoria quer conferir antes, e um diálogo de
 * impressão que salta na cara faz a pessoa fechar por reflexo sem ter olhado
 * nada. */
export function BarraDocumento() {
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
