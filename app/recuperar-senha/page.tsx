"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { pedirRecuperacao, type EstadoRecuperacao } from "./actions";
import { TelaAutenticacao } from "@/components/tela-autenticacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CircleCheck, Loader2, Mail, TriangleAlert } from "lucide-react";

function Conteudo() {
  const [state, formAction, pending] = useActionState<EstadoRecuperacao, FormData>(
    pedirRecuperacao,
    undefined
  );
  const expirado = useSearchParams().get("expirado") !== null;

  // Confirmação NO LUGAR do formulário, e não um aviso acima dele: deixar o
  // campo preenchido convida a mandar de novo, e o segundo pedido esbarra no
  // limite de tentativas do Supabase.
  if (state?.enviado) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-emerald-500/10">
          <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-heading text-lg font-semibold">Verifique seu e-mail</h1>
          <p className="text-sm text-muted-foreground">
            Se houver uma conta com esse endereço, o link para criar uma nova senha acabou de sair.
            Ele vale por uma hora.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Não chegou? Confira a caixa de spam. Se ainda assim não vier, peça ao gestor da sua
          unidade para redefinir a senha.
        </p>
        <Button variant="secondary" className="w-full" nativeButton={false} render={<Link href="/login" />}>
          Voltar ao login
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="font-heading text-xl font-semibold">Esqueceu a senha?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe o e-mail da sua conta e enviaremos um link para você criar uma nova.
        </p>
      </div>

      {expirado && (
        <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          O link anterior venceu ou já tinha sido usado. Peça outro abaixo.
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="voce@empresa.com"
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
          Enviar link
        </Button>
      </form>

      <Link
        href="/login"
        className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar ao login
      </Link>
    </>
  );
}

export default function RecuperarSenhaPage() {
  return (
    <TelaAutenticacao>
      <Suspense>
        <Conteudo />
      </Suspense>
    </TelaAutenticacao>
  );
}
