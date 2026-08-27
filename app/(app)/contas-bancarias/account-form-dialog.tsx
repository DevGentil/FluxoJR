"use client";

import { useActionState, useState } from "react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createAccount, updateAccount } from "./actions";
import type { ActionState } from "@/lib/actions-utils";
import { Pencil, Plus } from "lucide-react";

interface Props {
  account?: {
    id: string;
    name: string;
    type: string;
    initialBalance: number;
  };
}

export function AccountFormDialog({ account }: Props) {
  const [open, setOpen] = useState(false);
  const action = account ? updateAccount.bind(null, account.id) : createAccount;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      {account ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus />
          Nova conta
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>
            Cadastre a conta corrente, poupança, caixa físico ou qualquer outra conta da empresa.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required defaultValue={account?.name} placeholder="Conta Corrente Principal" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Tipo</Label>
            <Input id="type" name="type" defaultValue={account?.type ?? "Conta Corrente"} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="initialBalance">Saldo inicial (R$)</Label>
            <Input
              id="initialBalance"
              name="initialBalance"
              type="number"
              step="0.01"
              defaultValue={account?.initialBalance ?? 0}
              required
            />
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
