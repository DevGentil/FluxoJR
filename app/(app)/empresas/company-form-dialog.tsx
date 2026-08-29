"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { createCompany, updateCompany } from "./actions";
import { Pencil, Plus } from "lucide-react";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";
import type { ActionState } from "@/lib/actions-utils";

const NONE = "__none__";

interface Props {
  groups: { id: string; name: string }[];
  company?: { id: string; name: string; cnpj: string | null; groupId: string | null };
}

export function CompanyFormDialog({ groups, company }: Props) {
  const [open, setOpen] = useState(false);
  const action = company ? updateCompany.bind(null, company.id) : createCompany;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  const trigger = company ? (
    <DialogTrigger render={<Button variant="ghost" size="icon" />}>
      <Pencil className="size-4" />
    </DialogTrigger>
  ) : (
    <DialogTrigger render={<Button />}>
      <Plus />
      Nova empresa
    </DialogTrigger>
  );

  // Toda empresa nova precisa nascer associada a um grupo/marca — se ainda
  // não existe nenhum grupo cadastrado, orienta a criar um primeiro em vez
  // de mostrar um formulário sem opção válida de grupo.
  if (!company && groups.length === 0) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova empresa</DialogTitle>
            <DialogDescription>
              Toda empresa precisa pertencer a um grupo/marca. Crie um grupo primeiro (botão &quot;Novo grupo&quot;
              acima) e depois cadastre a empresa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{company ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          <DialogDescription>Uma empresa ou unidade/franquia da holding.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required defaultValue={company?.name} placeholder="Ex: AS Laguna" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              name="cnpj"
              required={!company}
              defaultValue={company?.cnpj ?? ""}
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="groupId">{company ? "Grupo/marca (opcional)" : "Grupo/marca"}</Label>
            {company ? (
              <Select
                name="groupId"
                items={{ [NONE]: "Sem grupo", ...Object.fromEntries(groups.map((g) => [g.id, g.name])) }}
                defaultValue={company.groupId ?? NONE}
              >
                <SelectTrigger id="groupId" className="w-full">
                  <SelectValue placeholder="Sem grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem grupo</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select name="groupId" items={Object.fromEntries(groups.map((g) => [g.id, g.name]))} required>
                <SelectTrigger id="groupId" className="w-full">
                  <SelectValue placeholder="Selecione um grupo" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
