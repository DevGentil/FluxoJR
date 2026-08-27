"use client";

import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";

interface Line {
  id: string;
  label: string;
  amount: number;
}

export interface CashClosingSummaryData {
  date: Date | string;
  accountName: string;
  companyName?: string;
  countedCash: number;
  notes?: string | null;
  sangrias: Line[];
  pagamentos: Line[];
}

function computeTotals(data: CashClosingSummaryData) {
  const totalSangrias = data.sangrias.reduce((s, l) => s + l.amount, 0);
  const totalPagamentos = data.pagamentos.reduce((s, l) => s + l.amount, 0);
  const valorCaixa = totalSangrias - totalPagamentos;
  const diferenca = data.countedCash - valorCaixa;
  return { totalSangrias, totalPagamentos, valorCaixa, diferenca };
}

export function DiferencaValue({ diferenca }: { diferenca: number }) {
  if (Math.abs(diferenca) < 0.005) {
    return <span className="text-muted-foreground">R$ 0,00</span>;
  }
  if (diferenca < 0) {
    return <Badge variant="destructive">Falta {formatCurrency(Math.abs(diferenca))}</Badge>;
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
    >
      Sobra {formatCurrency(diferenca)}
    </Badge>
  );
}

function LineList({ lines, colorClass }: { lines: Line[]; colorClass: string }) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma linha lançada.</p>;
  }
  return (
    <ul className="space-y-1">
      {lines.map((line) => (
        <li key={line.id} className="flex items-center justify-between text-sm">
          <span>{line.label}</span>
          <span className={`tabular-nums ${colorClass}`}>{formatCurrency(line.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export function CashClosingSummaryHeader({ data }: { data: CashClosingSummaryData }) {
  return (
    <>
      {data.companyName ? `${data.companyName} — ` : ""}
      {data.accountName} — {formatDate(data.date)}
    </>
  );
}

export function CashClosingSummary({ data }: { data: CashClosingSummaryData }) {
  const { totalSangrias, totalPagamentos, valorCaixa, diferenca } = computeTotals(data);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-2">Sangrias (dinheiro retirado de cada caixa)</p>
        <LineList lines={data.sangrias} colorClass="text-emerald-600 dark:text-emerald-400" />
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Pagamentos (saídas em dinheiro do dia)</p>
        <LineList lines={data.pagamentos} colorClass="text-red-600 dark:text-red-400" />
      </div>

      {data.notes && (
        <div>
          <p className="text-sm font-medium mb-1">Observações</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      <div className="rounded-lg border p-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total sangrias</span>
          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalSangrias)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total pagamentos</span>
          <span className="tabular-nums text-red-600 dark:text-red-400">
            {formatCurrency(totalPagamentos)}
          </span>
        </div>
        <div className="flex justify-between font-medium">
          <span>Valor do caixa (calculado)</span>
          <span className="tabular-nums">{formatCurrency(valorCaixa)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Dinheiro contado</span>
          <span className="tabular-nums">{formatCurrency(data.countedCash)}</span>
        </div>
        <div className="flex justify-between items-center font-medium">
          <span>Diferença (contado − calculado)</span>
          <DiferencaValue diferenca={diferenca} />
        </div>
      </div>
    </div>
  );
}
