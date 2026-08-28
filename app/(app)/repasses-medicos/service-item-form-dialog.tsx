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
import { createServiceItem, updateServiceItem } from "./service-items-actions";
import type { ActionState } from "@/lib/actions-utils";
import { Pencil, Plus } from "lucide-react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";

interface Props {
  serviceItem?: { id: string; name: string };
}

export function ServiceItemFormDialog({ serviceItem }: Props) {
  const [open, setOpen] = useState(false);
  const action = serviceItem ? updateServiceItem.bind(null, serviceItem.id) : createServiceItem;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {serviceItem ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus />
          Novo exame
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{serviceItem ? "Editar tipo de exame" : "Novo tipo de exame"}</DialogTitle>
          <DialogDescription>
            Catálogo de exames da empresa, usado para definir a taxa de cada médico.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required defaultValue={serviceItem?.name} placeholder="Ex: Ultrassom" />
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
