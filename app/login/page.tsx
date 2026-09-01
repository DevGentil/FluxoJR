"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { JRHoldingMark } from "@/components/jr-holding-logo";
import { Mail, Lock, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);

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
        <p className="mt-4 max-w-xs text-center text-sm text-muted-foreground">
          Fluxo de caixa e controle operacional de toda a holding, em um só
          lugar.
        </p>

        <div className="mt-8 w-full rounded-2xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="font-heading text-xl font-semibold">Bem-vindo de volta</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Entre com sua conta para acessar o FluxoJR.
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="voce@empresa.com"
                  className="h-11 pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link
                  href="/recuperar-senha"
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 pr-9 pl-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {state?.error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="size-4 shrink-0" />
                {state.error}
              </div>
            )}

            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>
        </div>

        <p className="mt-8 text-xs tracking-wide text-muted-foreground/60">
          FluxoJR · Gestão Financeira e Operacional
        </p>
      </div>
    </div>
  );
}
