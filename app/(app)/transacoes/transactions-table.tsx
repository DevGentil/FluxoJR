"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteTransaction, deleteTransactions } from "./actions";

interface Option {
  id: string;
  name: string;
}

interface TransactionRow {
  id: string;
  date: Date;
  description: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  transferCompanyId: string | null;
  source: "MANUAL" | "IMPORT" | "SCHEDULED";
  type: "INCOME" | "EXPENSE";
  amount: number;
}

interface Props {
  transactions: TransactionRow[];
  accounts: Option[];
  categories: (Option & { type: "INCOME" | "EXPENSE" })[];
  suppliers?: Option[];
  otherCompanies?: Option[];
}

export function TransactionsTable({ transactions, accounts, categories, suppliers = [], otherCompanies = [] }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allSelected = transactions.length > 0 && selected.size === transactions.length;
  const someSelected = selected.size > 0 && !allSelected;

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(transactions.map((t) => t.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleBulkDelete() {
    startTransition(async () => {
      const result = await deleteTransactions(selectedIds);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${selectedIds.length} transações excluídas.`);
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm">{selected.size} selecionada(s)</span>
          <AlertDialog>
            <AlertDialogTrigger render={<Button size="sm" variant="destructive" disabled={isPending} />}>
              <Trash2 className="size-4" />
              Excluir selecionadas
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir {selected.size} transação(ões)?</AlertDialogTitle>
                <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction disabled={isPending} onClick={handleBulkDelete}>
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={(checked) => toggleAll(Boolean(checked))}
                aria-label="Selecionar todas"
              />
            </TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                Nenhuma transação encontrada.
              </TableCell>
            </TableRow>
          )}
          {transactions.map((t) => (
            <TableRow key={t.id} data-state={selected.has(t.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox
                  checked={selected.has(t.id)}
                  onCheckedChange={(checked) => toggleOne(t.id, Boolean(checked))}
                  aria-label={`Selecionar transação ${t.description}`}
                />
              </TableCell>
              <TableCell>{formatDate(t.date)}</TableCell>
              <TableCell className="max-w-64 truncate">{t.description}</TableCell>
              <TableCell>{t.accountName}</TableCell>
              <TableCell>{t.categoryName ?? "—"}</TableCell>
              <TableCell>{t.supplierName ?? "—"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Badge variant="outline">
                    {t.source === "MANUAL" ? "Manual" : t.source === "IMPORT" ? "Importado" : "Baixa"}
                  </Badge>
                  {t.transferCompanyId && <Badge variant="secondary">Transferência</Badge>}
                </div>
              </TableCell>
              <TableCell
                className={`text-right tabular-nums font-medium ${
                  t.type === "INCOME" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {t.type === "INCOME" ? "+" : "-"}
                {formatCurrency(t.amount)}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <TransactionFormDialog
                    accounts={accounts}
                    categories={categories}
                    suppliers={suppliers}
                    otherCompanies={otherCompanies}
                    transaction={{
                      id: t.id,
                      date: t.date,
                      amount: t.amount,
                      type: t.type,
                      description: t.description,
                      accountId: t.accountId,
                      categoryId: t.categoryId,
                      supplierId: t.supplierId,
                      transferCompanyId: t.transferCompanyId,
                    }}
                  />
                  <DeleteButton action={deleteTransaction.bind(null, t.id)} title="Excluir transação?" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
