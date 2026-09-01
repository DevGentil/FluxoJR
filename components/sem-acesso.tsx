import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

/** O que a pessoa vê ao abrir uma tela que o papel dela não alcança.
 *
 * Diz o nome da tela em vez de um "acesso negado" seco: quem esbarrou aqui
 * precisa saber o que pedir ao gestor, e uma mensagem genérica vira chamado
 * de suporte. Não é 404 de propósito — fingir que a tela não existe confunde
 * quem chegou por um link legítimo de um colega. */
export function SemAcesso({ modulo }: { modulo: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Lock className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold">{modulo} não faz parte do seu acesso</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Sua função no sistema não inclui esta tela nesta unidade. Se você precisa dela para o seu
          trabalho, peça ao gestor da unidade ou à holding.
        </p>
      </div>
      <Button variant="secondary" size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
        Voltar ao início
      </Button>
    </div>
  );
}
