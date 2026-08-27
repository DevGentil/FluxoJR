"use client";

import { useState, type ReactNode } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { CashClosingSummary, DiferencaValue, type CashClosingSummaryData } from "./cash-closing-summary";

export interface CashClosingRowData extends CashClosingSummaryData {
  id: string;
}

function computeTotals(closing: CashClosingRowData) {
  const totalSangrias = closing.sangrias.reduce((s, l) => s + l.amount, 0);
  const totalPagamentos = closing.pagamentos.reduce((s, l) => s + l.amount, 0);
  const valorCaixa = totalSangrias - totalPagamentos;
  const diferenca = closing.countedCash - valorCaixa;
  return { totalSangrias, totalPagamentos, valorCaixa, diferenca };
}

interface Props {
  closing: CashClosingRowData;
  actions?: ReactNode;
}

export function CashClosingRow({ closing, actions }: Props) {
  const [open, setOpen] = useState(false);
  const { totalSangrias, totalPagamentos, valorCaixa, diferenca } = computeTotals(closing);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen(true)}>
        <TableCell className="font-medium">{formatDate(closing.date)}</TableCell>
        <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatCurrency(totalSangrias)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
          {formatCurrency(totalPagamentos)}
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatCurrency(valorCaixa)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatCurrency(closing.countedCash)}</TableCell>
        <TableCell className="text-right">
          <DiferencaValue diferenca={diferenca} />
        </TableCell>
        {actions && (
          <TableCell onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end gap-1">{actions}</div>
          </TableCell>
        )}
      </TableRow>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fechamento de {formatDate(closing.date)}</DialogTitle>
            <DialogDescription>
              {closing.companyName ? `${closing.companyName} — ` : ""}
              {closing.accountName}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <CashClosingSummary data={closing} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
