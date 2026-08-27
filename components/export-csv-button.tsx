"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Props {
  headers: string[];
  rows: (string | number)[][];
  fileName: string;
}

function csvCell(value: string | number) {
  return typeof value === "number" ? value.toFixed(2).replace(".", ",") : value;
}

export function ExportCsvButton({ headers, rows, fileName }: Props) {
  function handleExport() {
    const body = rows.map((row) => row.map(csvCell).join(";")).join("\n");
    const blob = new Blob([`${headers.join(";")}\n${body}`], { type: "text/csv;charset=utf-8;" });
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
