"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Plus, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { criarConta, editarConta } from "./actions";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/permissions";
import type { ActionState } from "@/lib/actions-utils";
import { useCloseOnSuccess } from "@/hooks/use-close-on-success";

interface Empresa {
  id: string;
  name: string;
}

interface ContaExistente {
  id: string;
  name: string;
  email: string;
  active: boolean;
  holding: boolean;
  acessos: { companyId: string; role: Role }[];
}

interface Props {
  empresas: Empresa[];
  /** Só uma conta da holding pode criar ou editar outra conta de holding. A
   * regra é repetida no servidor — aqui é só para não oferecer o que vai ser
   * recusado. */
  podeHolding: boolean;
  conta?: ContaExistente;
}

export function ContaFormDialog({ empresas, podeHolding, conta }: Props) {
  const editando = Boolean(conta);
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(conta?.holding ?? false);
  const [acessos, setAcessos] = useState<{ companyId: string; role: Role }[]>(
    conta?.acessos ?? []
  );

  const action = editando ? editarConta : criarConta;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  useCloseOnSuccess(pending, Boolean(state?.error), () => setOpen(false));

  function definirPapel(companyId: string, role: Role | null) {
    setAcessos((atual) => {
      const semEsta = atual.filter((a) => a.companyId !== companyId);
      return role ? [...semEsta, { companyId, role }] : semEsta;
    });
  }

  const papelDe = (companyId: string) => acessos.find((a) => a.companyId === companyId)?.role ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          editando ? (
            <Button variant="ghost" size="icon" aria-label={`Editar acesso de ${conta!.name}`} />
          ) : (
            <Button size="sm" />
          )
        }
      >
        {editando ? (
          <Pencil className="size-4" />
        ) : (
          <>
            <Plus className="size-4" />
            Nova conta
          </>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? `Acesso de ${conta!.name}` : "Nova conta de acesso"}</DialogTitle>
          <DialogDescription>
            {editando
              ? "Altere o nome, as unidades e a função. Para trocar a senha, use o botão da chave."
              : "A pessoa entra com a senha que você definir aqui e escolhe a dela no primeiro acesso."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {editando && <input type="hidden" name="id" value={conta!.id} />}
          <input type="hidden" name="holding" value={String(holding)} />
          <input type="hidden" name="acessos" value={JSON.stringify(holding ? [] : acessos)} />

          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" defaultValue={conta?.name ?? ""} required minLength={2} />
          </div>

          {editando ? (
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <p className="text-sm text-muted-foreground">{conta!.email}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" required autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha">Senha inicial</Label>
                <Input
                  id="senha"
                  name="senha"
                  type="text"
                  required
                  minLength={8}
                  autoComplete="off"
                  placeholder="Ao menos 8 caracteres"
                />
                <p className="text-xs text-muted-foreground">
                  Entregue essa senha à pessoa. Ela será obrigada a trocar por uma própria antes de
                  usar o sistema.
                </p>
              </div>
            </>
          )}

          {podeHolding && (
            <label className="flex items-start gap-2.5 rounded-lg border p-3">
              <Checkbox
                checked={holding}
                onCheckedChange={(v) => setHolding(Boolean(v))}
                aria-label="Conta da holding"
              />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="size-4 text-amber-500" />
                  Conta da holding
                </span>
                <span className="block text-muted-foreground text-xs mt-0.5">
                  Acesso total a todas as unidades, inclusive às que forem criadas depois. Não usa
                  função por unidade.
                </span>
              </span>
            </label>
          )}

          {!holding && (
            <div className="space-y-2">
              <Label>Unidades e função</Label>
              {empresas.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma unidade disponível.</p>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {empresas.map((e) => {
                  const papel = papelDe(e.id);
                  return (
                    <div key={e.id} className="rounded-lg border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{e.name}</span>
                        {papel && (
                          <button
                            type="button"
                            onClick={() => definirPapel(e.id, null)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Remover acesso a ${e.name}`}
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {ROLES.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => definirPapel(e.id, r)}
                            title={ROLE_DESCRIPTIONS[r]}
                            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                              papel === r
                                ? "border-primary bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                            }`}
                          >
                            {ROLE_LABELS[r]}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {acessos.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Escolha a função em ao menos uma unidade.
                </p>
              )}
            </div>
          )}

          {editando && (
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                name="active"
                value="true"
                defaultChecked={conta!.active}
                aria-label="Conta ativa"
              />
              Conta ativa
              {!conta!.active && <Badge variant="outline">Desativada hoje</Badge>}
            </label>
          )}

          {state?.error && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {editando ? "Salvar" : "Criar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
