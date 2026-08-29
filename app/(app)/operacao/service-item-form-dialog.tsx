"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { createServiceItem, updateServiceItem } from "./service-items-actions";
import {
  CATEGORY_LABELS,
  NO_PAYER,
  PAYER_LABELS,
  type ServiceCategory,
  type Payer,
} from "@/lib/service-catalog";
import type { ActionState } from "@/lib/actions-utils";
import { Pencil, Plus } from "lucide-react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";

const PAYER_SELECT_LABELS: Record<string, string> = {
  [NO_PAYER]: "Não se aplica",
  ...PAYER_LABELS,
};

export interface ServiceItemFormValues {
  id: string;
  name: string;
  group: string | null;
  category: ServiceCategory;
  payer: Payer | null;
  price: number | null;
  operationalCost: number;
  active: boolean;
}

interface Props {
  serviceItem?: ServiceItemFormValues;
  /** Grupos já usados na empresa, sugeridos no campo. */
  groups?: string[];
}

export function ServiceItemFormDialog({ serviceItem, groups = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(serviceItem?.active ?? true);
  const action = serviceItem ? updateServiceItem.bind(null, serviceItem.id) : createServiceItem;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setActive(serviceItem?.active ?? true);
      }}
    >
      {serviceItem ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus />
          Novo item
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{serviceItem ? "Editar item do catálogo" : "Novo item do catálogo"}</DialogTitle>
          <DialogDescription>
            Consulta, exame, procedimento, plantão ou auxílio. Preço e custo operacional alimentam o cálculo de
            margem; o repasse fica no contrato de cada médico.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={serviceItem?.name}
              placeholder="Ex: Consulta CT, Raio-X, Plantão 10hrs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select name="category" items={CATEGORY_LABELS} defaultValue={serviceItem?.category ?? "EXAME"}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(CATEGORY_LABELS) as [ServiceCategory, string][]).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payer">Convênio</Label>
              <Select name="payer" items={PAYER_SELECT_LABELS} defaultValue={serviceItem?.payer ?? NO_PAYER}>
                <SelectTrigger id="payer" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYER_SELECT_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="group">Grupo (opcional)</Label>
            <Input
              id="group"
              name="group"
              list="service-item-groups"
              defaultValue={serviceItem?.group ?? ""}
              placeholder="Ex: Proced de baixo custos, US, ECG e similares"
            />
            <datalist id="service-item-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Valor cobrado (R$)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={serviceItem?.price ?? ""}
                placeholder="Vazio se não cobra"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operationalCost">Custo operacional (R$)</Label>
              <Input
                id="operationalCost"
                name="operationalCost"
                type="number"
                step="0.01"
                min="0"
                defaultValue={serviceItem?.operationalCost ?? 0}
              />
            </div>
          </div>

          <input type="hidden" name="active" value={active ? "true" : "false"} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(c) => setActive(Boolean(c))} />
            Item ativo
          </label>

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
