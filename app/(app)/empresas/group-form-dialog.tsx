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
import { createGroup, updateGroup } from "./actions";
import { Pencil, Plus } from "lucide-react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";
import type { ActionState } from "@/lib/actions-utils";

interface Props {
  group?: { id: string; name: string };
}

export function GroupFormDialog({ group }: Props) {
  const [open, setOpen] = useState(false);
  const action = group ? updateGroup.bind(null, group.id) : createGroup;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {group ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" />}>
          <Plus />
          Novo grupo
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? "Editar grupo" : "Novo grupo"}</DialogTitle>
          <DialogDescription>
            Uma marca/franquia que agrupa várias empresas (ex: &quot;AmorSaude&quot;).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required defaultValue={group?.name} placeholder="Ex: AmorSaude" />
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
