"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
import { CheckCircle2 } from "lucide-react";
import { markAsPaid } from "./actions";

interface Props {
  entryId: string;
  type: "PAYABLE" | "RECEIVABLE";
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
}

export function MarkPaidDialog({ entryId, type, accounts, defaultAccountId }: Props) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  function confirm() {
    if (!accountId) return;
    startTransition(async () => {
      await markAsPaid(entryId, accountId);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <CheckCircle2 className="size-4" />
        {type === "PAYABLE" ? "Marcar como pago" : "Marcar como recebido"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar baixa</DialogTitle>
          <DialogDescription>
            Isso cria a transação correspondente na conta selecionada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Conta</Label>
          <Select
            items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
            value={accountId}
            onValueChange={(v) => setAccountId(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione a conta" />
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
        <DialogFooter>
          <Button onClick={confirm} disabled={!accountId || isPending}>
            {isPending ? "Confirmando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
