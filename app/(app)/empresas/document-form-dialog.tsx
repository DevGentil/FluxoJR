"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { uploadDocument } from "./documents-actions";
import type { ActionState } from "@/lib/actions-utils";
import { Upload } from "lucide-react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";

export function DocumentFormDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(uploadDocument, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Upload />
        Novo documento
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo documento</DialogTitle>
          <DialogDescription>
            Qualquer tipo de arquivo (contrato, documento societário, etc.), até 10MB.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Arquivo</Label>
            <Input id="file" name="file" type="file" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">O que é esse arquivo?</Label>
            <Textarea
              id="description"
              name="description"
              required
              placeholder="Ex: Contrato de locação da unidade, assinado em 03/2026"
            />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
