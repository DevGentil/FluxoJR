"use client";

import { useActionState, useState } from "react";
import { trocarSenha } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { JRHoldingMark } from "@/components/jr-holding-logo";
import { Lock, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";

export default function TrocarSenhaPage() {
  const [state, formAction, pending] = useActionState(trocarSenha, undefined);
  const [mostrar, setMostrar] = useState(false);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-16">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% 28%, color-mix(in oklch, #c9a24b 16%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <JRHoldingMark className="h-24 w-24 drop-shadow-[0_0_24px_rgba(201,162,75,0.18)]" sizes="96px" />

        <div className="mt-8 w-full rounded-2xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="font-heading text-xl font-semibold">Crie a sua senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A senha atual foi definida por quem cadastrou o seu acesso. Escolha uma que só você saiba
              para continuar.
            </p>
          </div>

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
              Salvar e entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
