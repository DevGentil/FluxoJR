"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableDisclosure } from "@/components/table-disclosure";
import { CircleCheck } from "lucide-react";
import { marcarVisto } from "./actions";

interface Erro {
  id: string;
  at: Date;
  message: string;
  digest: string | null;
  stack: string | null;
  route: string | null;
  method: string | null;
  seen: boolean;
}

function quando(at: Date) {
  return at.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Uma ocorrência, fechada por padrão.
 *
 * A pilha fica escondida porque ela é longa e quase toda de frameworks; o
 * que responde "o que quebrou e onde" é a primeira linha e a rota. */
export function ErroLinha({ erro }: { erro: Erro }) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  function marcar() {
    startTransition(async () => {
      const r = await marcarVisto(erro.id);
      if (r?.error) toast.error(r.error);
    });
  }

  return (
    <div className={`py-3 ${erro.seen ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <TableDisclosure
            open={aberto}
            onToggle={() => setAberto((v) => !v)}
            label={`o erro de ${quando(erro.at)}`}
          >
            <span className="truncate font-medium text-sm">{erro.message}</span>
          </TableDisclosure>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[22px] text-xs text-muted-foreground">
            <span className="tabular-nums">{quando(erro.at)}</span>
            {erro.route && (
              <span className="font-mono">
                {erro.method} {erro.route}
              </span>
            )}
            {erro.digest && <span className="font-mono">código {erro.digest}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {erro.seen ? (
            <Badge variant="outline">Visto</Badge>
          ) : (
            <Button size="sm" variant="ghost" onClick={marcar} disabled={pending}>
              <CircleCheck className="size-4" />
              Visto
            </Button>
          )}
        </div>
      </div>

      {aberto && erro.stack && (
        <pre className="mt-2 ml-[22px] max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed">
          {erro.stack}
        </pre>
      )}
      {aberto && !erro.stack && (
        <p className="mt-2 ml-[22px] text-xs text-muted-foreground">
          Sem pilha registrada para esta ocorrência.
        </p>
      )}
    </div>
  );
}
