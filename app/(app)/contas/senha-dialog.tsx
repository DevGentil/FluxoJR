"use client";

import { useActionState, useState } from "react";
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
import { KeyRound, TriangleAlert } from "lucide-react";
import { redefinirSenha } from "./actions";
import type { ActionState } from "@/lib/actions-utils";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";

/** O "esqueci a senha" da casa: quem administra define uma nova e entrega.
 *
 * A conta volta ao estado provisório, então a pessoa é obrigada a escolher a
 * dela antes de usar o sistema — a senha que passou pelo WhatsApp morre no
 * primeiro acesso. */
export function SenhaDialog({ contaId, nome }: { contaId: string; nome: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    redefinirSenha,
    undefined
  );
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon" aria-label={`Redefinir a senha de ${nome}`} />}
      >
        <KeyRound className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Redefinir a senha de {nome}</DialogTitle>
          <DialogDescription>
            Entregue a nova senha à pessoa. Ela será obrigada a trocar por uma própria no próximo
            acesso.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={contaId} />
          <div className="space-y-1.5">
            <Label htmlFor={`senha-${contaId}`}>Nova senha</Label>
            <Input
              id={`senha-${contaId}`}
              name="senha"
              type="text"
              required
              minLength={8}
              autoComplete="off"
              placeholder="Ao menos 8 caracteres"
            />
          </div>
          {state?.error && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {state.error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Redefinir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
