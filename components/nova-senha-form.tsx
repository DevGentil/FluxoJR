"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Lock, TriangleAlert } from "lucide-react";
import type { ActionState } from "@/lib/actions-utils";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  rotulo: string;
};

/** O formulário de escolher senha, usado tanto na troca obrigatória do
 * primeiro acesso quanto na recuperação por e-mail. As duas telas pedem a
 * mesma coisa; só muda a ação e o texto do botão. */
export function NovaSenhaForm({ action, rotulo }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [mostrar, setMostrar] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="senha">Nova senha</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="senha"
            name="senha"
            type={mostrar ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
            placeholder="Ao menos 8 caracteres"
            className="pl-9 pr-9"
          />
          <button
            type="button"
            onClick={() => setMostrar((v) => !v)}
            aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {mostrar ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmacao">Repita a nova senha</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="confirmacao"
            name="confirmacao"
            type={mostrar ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            className="pl-9"
          />
        </div>
      </div>

      {state?.error && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {rotulo}
      </Button>
    </form>
  );
}
