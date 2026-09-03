"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { baixarPlanilhaDre } from "@/lib/dre-planilha";
import type { Dre } from "@/lib/dre";

interface Props {
  dre: Dre;
  fileName: string;
}

/** Baixa o DRE no formato exato da planilha que a contabilidade já usa —
 * célula por célula, não um CSV genérico agrupado por categoria. */
export function ExportarDreButton({ dre, fileName }: Props) {
  return (
    <Button variant="outline" onClick={() => baixarPlanilhaDre(dre, fileName)}>
      <Download />
      Exportar DRE (Excel)
    </Button>
  );
}
