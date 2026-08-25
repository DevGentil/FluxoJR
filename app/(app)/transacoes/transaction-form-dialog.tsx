"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createTransaction, updateTransaction } from "./actions";
import type { ActionState } from "@/lib/actions-utils";
import { Pencil, Plus } from "lucide-react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";
import { toDateInputValue } from "@/lib/format";

interface Option {
  id: string;
  name: string;
}

const NONE = "__none__";

interface Props {
  accounts: Option[];
  categories: (Option & { type: "INCOME" | "EXPENSE" })[];
  suppliers?: Option[];
  otherCompanies?: Option[];
  transaction?: {
    id: string;
    date: Date;
    amount: number;
    type: "INCOME" | "EXPENSE";
    description: string;
    accountId: string;
    categoryId: string | null;
    supplierId?: string | null;
    transferCompanyId?: string | null;
  };
}

export function TransactionFormDialog({ accounts, categories, suppliers = [], otherCompanies = [], transaction }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"INCOME" | "EXPENSE">(transaction?.type ?? "EXPENSE");
  const action = transaction ? updateTransaction.bind(null, transaction.id) : createTransaction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  const filteredCategories = categories.filter((c) => c.type === type);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {transaction ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus />
          Nova transação
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction ? "Editar transação" : "Nova transação"}</DialogTitle>
          <DialogDescription>Lance uma entrada ou saída manualmente.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select
                name="type"
                items={{ INCOME: "Entrada", EXPENSE: "Saída" }}
                value={type}
                onValueChange={(v) => setType(v as "INCOME" | "EXPENSE")}
                required
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Entrada</SelectItem>
                  <SelectItem value="EXPENSE">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                defaultValue={transaction ? toDateInputValue(transaction.date) : toDateInputValue(new Date())}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" required defaultValue={transaction?.description} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={transaction?.amount}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountId">Conta</Label>
              <Select
                name="accountId"
                items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
                defaultValue={transaction?.accountId}
                required
              >
                <SelectTrigger id="accountId" className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="categoryId">Categoria</Label>
              <Select
                name="categoryId"
                items={Object.fromEntries(categories.map((c) => [c.id, c.name]))}
                defaultValue={transaction?.categoryId ?? undefined}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierId">Fornecedor</Label>
              <Select
                name="supplierId"
                items={{ [NONE]: "Sem fornecedor", ...Object.fromEntries(suppliers.map((s) => [s.id, s.name])) }}
                defaultValue={transaction?.supplierId ?? NONE}
              >
                <SelectTrigger id="supplierId" className="w-full">
                  <SelectValue placeholder="Sem fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem fornecedor</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {otherCompanies.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="transferCompanyId">Transferência entre empresas (opcional)</Label>
              <Select
                name="transferCompanyId"
                items={{ [NONE]: "Não é transferência", ...Object.fromEntries(otherCompanies.map((c) => [c.id, c.name])) }}
                defaultValue={transaction?.transferCompanyId ?? NONE}
              >
                <SelectTrigger id="transferCompanyId" className="w-full">
                  <SelectValue placeholder="Não é transferência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não é transferência</SelectItem>
                  {otherCompanies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {type === "INCOME" ? `Recebido de ${c.name}` : `Enviado para ${c.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Marca como repasse interno do grupo — não entra no faturamento/despesa dos relatórios.
              </p>
            </div>
          )}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
