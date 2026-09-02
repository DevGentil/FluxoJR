"use client";

import { useActionState, useState } from "react";
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
import { CampoAnexos } from "@/components/campo-anexos";
import type { ActionState } from "@/lib/actions-utils";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";

interface Props {
  entryId: string;
  type: "PAYABLE" | "RECEIVABLE";
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
}

/** Confirmação da baixa.
 *
 * Virou `<form>` para o comprovante poder viajar junto: é aqui que ele
 * existe na vida real — quem acabou de pagar tem o PDF do banco na mão, e
 * pedir para anexar depois, numa segunda tela, é o mesmo que não pedir. */
export function MarkPaidDialog({ entryId, type, accounts, defaultAccountId }: Props) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    markAsPaid.bind(null, entryId),
    undefined
  );
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* O rótulo aparece onde há espaço e some antes de espremer o resto
          da linha — em tela estreita o ícone e o `title` bastam, e é
          preferível ao texto empurrando os outros botões para fora. */}
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            title={type === "PAYABLE" ? "Marcar como pago" : "Marcar como recebido"}
            aria-label={type === "PAYABLE" ? "Marcar como pago" : "Marcar como recebido"}
          />
        }
      >
        <CheckCircle2 className="size-4" />
        <span className="hidden xl:inline">
          {type === "PAYABLE" ? "Marcar como pago" : "Marcar como recebido"}
        </span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar baixa</DialogTitle>
          <DialogDescription>
            Isso cria a transação correspondente na conta selecionada.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label>Conta</Label>
            {/* O Select é controlado e não envia valor sozinho; o hidden é
                o que de fato chega ao servidor. */}
            <input type="hidden" name="accountId" value={accountId} />
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

          <CampoAnexos />

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={!accountId || pending}>
              {pending ? "Confirmando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
