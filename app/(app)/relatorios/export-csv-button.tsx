"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Row {
  categoria: string;
  tipo: string;
  centroCusto: string;
  total: number;
}

export function ExportCsvButton({ rows, fileName }: { rows: Row[]; fileName: string }) {
  function handleExport() {
    const header = "Categoria;Tipo;Centro de Custo;Total\n";
    const body = rows
      .map((r) => `${r.categoria};${r.tipo};${r.centroCusto};${r.total.toFixed(2).replace(".", ",")}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download />
      Exportar CSV
    </Button>
  );
}
