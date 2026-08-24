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
import { createScheduledEntry, updateScheduledEntry } from "./actions";
import type { ActionState } from "@/lib/actions-utils";
import { Pencil, Plus } from "lucide-react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";
import { toDateInputValue } from "@/lib/format";

interface Option {
  id: string;
  name: string;
}

interface Props {
  accounts: Option[];
  categories: (Option & { type: "INCOME" | "EXPENSE" })[];
  defaultType?: "PAYABLE" | "RECEIVABLE";
  entry?: {
    id: string;
    type: "PAYABLE" | "RECEIVABLE";
    description: string;
    amount: number;
    dueDate: Date;
    accountId: string | null;
    categoryId: string | null;
  };
}

const NONE = "__none__";

export function ScheduledFormDialog({ accounts, categories, defaultType = "PAYABLE", entry }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"PAYABLE" | "RECEIVABLE">(entry?.type ?? defaultType);
  const action = entry ? updateScheduledEntry.bind(null, entry.id) : createScheduledEntry;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  const relevantCategoryType = type === "PAYABLE" ? "EXPENSE" : "INCOME";
  const filteredCategories = categories.filter((c) => c.type === relevantCategoryType);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {entry ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus />
          {defaultType === "PAYABLE" ? "Nova conta a pagar" : "Nova conta a receber"}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Editar lançamento" : "Novo lançamento previsto"}</DialogTitle>
          <DialogDescription>Contas a pagar ou receber com vencimento futuro.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type">Tipo</Label>
            <Select
              name="type"
              items={{ PAYABLE: "A pagar", RECEIVABLE: "A receber" }}
              value={type}
              onValueChange={(v) => setType(v as "PAYABLE" | "RECEIVABLE")}
              required
            >
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PAYABLE">A pagar</SelectItem>
                <SelectItem value="RECEIVABLE">A receber</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" required defaultValue={entry?.description} />
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
                defaultValue={entry?.amount}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Vencimento</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                required
                defaultValue={entry ? toDateInputValue(entry.dueDate) : undefined}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="accountId">Conta (opcional)</Label>
              <Select
                name="accountId"
                items={{ [NONE]: "Definir na baixa", ...Object.fromEntries(accounts.map((a) => [a.id, a.name])) }}
                defaultValue={entry?.accountId ?? NONE}
              >
                <SelectTrigger id="accountId" className="w-full">
                  <SelectValue placeholder="Definir na baixa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Definir na baixa</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryId">Categoria</Label>
              <Select
                name="categoryId"
                items={{ [NONE]: "Sem categoria", ...Object.fromEntries(categories.map((c) => [c.id, c.name])) }}
                defaultValue={entry?.categoryId ?? NONE}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem categoria</SelectItem>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
