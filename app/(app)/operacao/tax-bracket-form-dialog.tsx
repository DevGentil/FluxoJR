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
import { createTaxBracket, updateTaxBracket } from "./tax-brackets-actions";
import type { ActionState } from "@/lib/actions-utils";
import { Pencil, Plus } from "lucide-react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";

export interface TaxBracketFormValues {
  id: string;
  minValue: number;
  maxValue: number | null;
  percent: number;
  notes: string | null;
}

interface Props {
  bracket?: TaxBracketFormValues;
}

export function TaxBracketFormDialog({ bracket }: Props) {
  const [open, setOpen] = useState(false);
  const action = bracket ? updateTaxBracket.bind(null, bracket.id) : createTaxBracket;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {bracket ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus className="size-4" />
          Nova faixa
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bracket ? "Editar faixa de taxa" : "Nova faixa de taxa"}</DialogTitle>
          <DialogDescription>
            Percentual que sai do valor cobrado — maquininha, impostos e demais custos proporcionais —
            conforme a faixa. Deixe o máximo vazio para a
            última faixa (sem teto).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minValue">De (R$)</Label>
              <Input
                id="minValue"
                name="minValue"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={bracket?.minValue ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxValue">Até (R$)</Label>
              <Input
                id="maxValue"
                name="maxValue"
                type="number"
                step="0.01"
                min="0"
                defaultValue={bracket?.maxValue ?? ""}
                placeholder="Sem teto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="percent">Taxa (%)</Label>
              <Input
                id="percent"
                name="percent"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={bracket?.percent ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observação (opcional)</Label>
            <Input
              id="notes"
              name="notes"
              defaultValue={bracket?.notes ?? ""}
              placeholder="Ex: crédito parcelado em até 12x"
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
