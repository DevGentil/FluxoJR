"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { baixarPlanilhaTransacoes, type LinhaTransacaoPlanilha } from "@/lib/transacoes-planilha";

interface Props {
  linhas: LinhaTransacaoPlanilha[];
  fileName: string;
}

/** Baixa o extrato filtrado como planilha — valores como número, com moeda
 * formatada, e o resumo de entradas/saídas/resultado no fim. */
export function ExportarTransacoesButton({ linhas, fileName }: Props) {
  return (
    <Button variant="outline" onClick={() => baixarPlanilhaTransacoes(linhas, fileName)}>
      <Download />
      Exportar Excel
    </Button>
  );
}
