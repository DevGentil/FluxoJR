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
  aprovado: boolean;
  /** Quem aprovou, quando houve. */
  aprovadoPor?: string | null;
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
  /** Abre o detalhe assim que a tela carrega.
   *
   * E como o atalho vindo de Transacoes chega aqui: a pessoa clicou em
   * "ver o fechamento deste dia" querendo o detalhe, nao a lista. Faze-la
   * procurar a linha certa depois de ja ter apontado qual e seria pedir o
   * mesmo clique duas vezes. */
  abrirDetalhe?: boolean;
}

export function CashClosingRow({ closing, actions, abrirDetalhe = false }: Props) {
  const [open, setOpen] = useState(abrirDetalhe);
  const { totalSangrias, totalPagamentos, valorCaixa, diferenca } = computeTotals(closing);

  return (
    <>
      {/* Clique na linha abre o detalhe, MENOS quando vem da coluna de
          ações. Antes a célula chamava `stopPropagation`, e isso atrapalha
          a detecção de clique-fora dos diálogos que moram nela: o de
          anexos abria e fechava sozinho. Aqui a linha ignora o clique pela
          origem, sem interromper o evento no caminho. */}
      <TableRow
        className="cursor-pointer"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-acoes]")) return;
          setOpen(true);
        }}
      >
        <TableCell className="font-medium whitespace-nowrap">{formatDate(closing.date)}</TableCell>
        <TableCell>
          {/* Selo com texto, e não só cor: "pendente" é a informação que
              decide se alguém precisa agir, e cor sozinha não serve a quem
              não a distingue. */}
          <span
            className={
              closing.aprovado
                ? "inline-block rounded bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:text-emerald-400"
                : "inline-block rounded bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-400"
            }
            title={closing.aprovado && closing.aprovadoPor ? `Aprovado por ${closing.aprovadoPor}` : undefined}
          >
            {closing.aprovado ? "Aprovado" : "Pendente"}
          </span>
        </TableCell>
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
          <TableCell data-acoes>
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
