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
import { uploadDreReport } from "./dre-reports-actions";
import type { ActionState } from "@/lib/actions-utils";
import { Upload } from "lucide-react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function DreReportFormDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(uploadDreReport, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload />
        Novo DRE realizado
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo DRE realizado</DialogTitle>
          <DialogDescription>
            Guarde o DRE oficial de um mês (Excel, PDF etc.) como referência, até 10MB.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="competencia">Mês de referência</Label>
            <Input id="competencia" name="competencia" type="month" required defaultValue={currentMonth()} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file">Arquivo</Label>
            <Input id="file" name="file" type="file" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea id="notes" name="notes" placeholder="Ex: fechado pelo contador em 05/09" />
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
