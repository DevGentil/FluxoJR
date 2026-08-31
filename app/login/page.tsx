"use client";

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
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Painel de marca — só em telas grandes */}
      <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-black p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 38%, color-mix(in oklch, #c9a24b 22%, transparent) 0%, transparent 60%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative flex flex-col items-center text-center">
          <JRHoldingMark className="h-56 w-56 drop-shadow-[0_0_40px_rgba(201,162,75,0.25)]" />
          <p className="mt-6 max-w-xs text-sm text-white/50">
            Fluxo de caixa e controle operacional de toda a holding, em um só
            lugar.
          </p>
        </div>

        <p className="absolute bottom-8 text-xs tracking-wide text-white/30">
          FluxoJR · Gestão Financeira e Operacional
        </p>
      </div>

      {/* Painel de login */}
      <div className="relative flex items-center justify-center bg-background p-6">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-4 lg:items-start">
            <JRHoldingMark showWordmark={false} className="h-14 w-14 lg:hidden" />
            <div className="text-center lg:text-left">
              <h1 className="font-heading text-2xl font-semibold">Bem-vindo de volta</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Entre com sua conta para acessar o FluxoJR.
              </p>
            </div>
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
              <Label htmlFor="password">Senha</Label>
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
      </div>
    </div>
  );
}
