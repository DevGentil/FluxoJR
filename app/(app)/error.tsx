"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RotateCw } from "lucide-react";

/** Fronteira de erro do app. Sem ela, qualquer exceção num Server Component
 * — banco fora do ar, sessão expirada no meio de uma consulta — derruba a
 * navegação inteira na tela genérica do Next, sem caminho de volta.
 *
 * Fica dentro do grupo (app), então a barra lateral continua no lugar e dá
 * para trocar de tela sem recarregar. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // O digest é o que liga esta tela ao stack trace real no log do servidor;
    // a mensagem em si vem redigida em produção.
    console.error("Erro na tela:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            <CardTitle>Não foi possível carregar esta tela</CardTitle>
          </div>
          <CardDescription>
            O erro foi registrado. Tentar de novo costuma resolver quando é uma falha momentânea de
            conexão com o banco.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Código para suporte: <code className="font-mono">{error.digest}</code>
            </p>
          )}
          <Button onClick={reset}>
            <RotateCw className="size-4" />
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
