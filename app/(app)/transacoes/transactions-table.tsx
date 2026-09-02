"use client";

import Link from "next/link";

import { Fragment, useMemo, useState, useTransition } from "react";
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
import { ChevronDown, ChevronRight, Receipt, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteTransaction, deleteTransactions } from "./actions";
import type { AnexoSalvo } from "@/components/campo-anexos";
import { AnexosPopover } from "@/components/anexos-popover";

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
  anexos: AnexoSalvo[];
  /** Preenchido quando a transação nasceu de um fechamento de caixa. */
  cashClosingId: string | null;
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
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

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

  function toggleDay(dayId: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
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

  // Já vem ordenado por conta e depois por data (mais recente primeiro) na
  // consulta — agrupa visualmente em conta -> dia, com totais de
  // entradas/saídas por dia. Reduz a poluição de listar cada lançamento
  // solto quando o volume cresce; clicar num dia expande o detalhe.
  const groups = useMemo(() => {
    const result: { accountName: string; days: { key: string; date: Date; transactions: TransactionRow[] }[] }[] = [];
    for (const t of transactions) {
      let accGroup = result[result.length - 1];
      if (!accGroup || accGroup.accountName !== t.accountName) {
        accGroup = { accountName: t.accountName, days: [] };
        result.push(accGroup);
      }
      const dayKey = t.date.toISOString().slice(0, 10);
      let dayGroup = accGroup.days[accGroup.days.length - 1];
      if (!dayGroup || dayGroup.key !== dayKey) {
        dayGroup = { key: dayKey, date: t.date, transactions: [] };
        accGroup.days.push(dayGroup);
      }
      dayGroup.transactions.push(t);
    }
    return result;
  }, [transactions]);

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
            <TableHead>Categoria</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="w-36" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Nenhuma transação encontrada.
              </TableCell>
            </TableRow>
          )}
          {groups.map((group) => (
            <Fragment key={group.accountName}>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={8} className="font-semibold">
                  {group.accountName}
                </TableCell>
              </TableRow>
              {group.days.map((day) => {
                const dayId = `${group.accountName}__${day.key}`;
                const isExpanded = expandedDays.has(dayId);
                const income = day.transactions
                  .filter((t) => t.type === "INCOME")
                  .reduce((s, t) => s + t.amount, 0);
                const expense = day.transactions
                  .filter((t) => t.type === "EXPENSE")
                  .reduce((s, t) => s + t.amount, 0);
                return (
                  <Fragment key={dayId}>
                    <TableRow className="cursor-pointer" onClick={() => toggleDay(dayId)}>
                      <TableCell onClick={(e) => e.stopPropagation()} />
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                          )}
                          {formatDate(day.date)}
                        </span>
                      </TableCell>
                      <TableCell colSpan={3} className="text-muted-foreground text-sm">
                        {day.transactions.length} transação(ões)
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums text-sm">
                        {income > 0 && (
                          <div className="text-emerald-600 dark:text-emerald-400">+{formatCurrency(income)}</div>
                        )}
                        {expense > 0 && (
                          <div className="text-red-600 dark:text-red-400">-{formatCurrency(expense)}</div>
                        )}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                    {isExpanded &&
                      day.transactions.map((t) => (
                        <TableRow key={t.id} data-state={selected.has(t.id) ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(t.id)}
                              onCheckedChange={(checked) => toggleOne(t.id, Boolean(checked))}
                              aria-label={`Selecionar transação ${t.description}`}
                            />
                          </TableCell>
                          <TableCell className="pl-6 text-muted-foreground text-sm">{formatDate(t.date)}</TableCell>
                          <TableCell className="max-w-64 truncate">{t.description}</TableCell>
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
                              t.type === "INCOME"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {t.type === "INCOME" ? "+" : "-"}
                            {formatCurrency(t.amount)}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <AnexosPopover anexos={t.anexos} titulo={t.description} />
                              {/* A transação do fechamento é o resumo do
                                  dia; cada sangria e cada pagamento ficam
                                  no fechamento. Sem este atalho a pessoa
                                  lia "Caixa do dia" e não tinha como abrir
                                  o que compõe o número. */}
                              {t.cashClosingId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Ver o fechamento de caixa deste dia"
                                  aria-label="Ver o fechamento de caixa deste dia"
                                  nativeButton={false}
                                  render={<Link href={`/fechamento-caixa?ver=${t.cashClosingId}`} />}
                                >
                                  <Receipt className="size-4" />
                                </Button>
                              )}
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
                                  anexos: t.anexos,
                                }}
                              />
                              <DeleteButton action={deleteTransaction.bind(null, t.id)} title="Excluir transação?" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
