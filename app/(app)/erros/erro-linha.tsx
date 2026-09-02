"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteButton } from "@/components/delete-button";
import { ChevronDown, ChevronRight, CircleCheck } from "lucide-react";
import { marcarVisto } from "./actions";
import { resumirErro } from "@/lib/erro-resumo";
import { SeloGravidade } from "./selo-gravidade";
import type { Gravidade } from "@/lib/erro-gravidade";
import type { ActionState } from "@/lib/actions-utils";

export interface Erro {
  id: string;
  at: Date;
  message: string;
  digest: string | null;
  stack: string | null;
  route: string | null;
  method: string | null;
  seen: boolean;
  severity: Gravidade;
}

function quando(at: Date) {
  return at.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface Props {
  erro: Erro;
  selecionado: boolean;
  aoSelecionar: () => void;
  aoExcluir: () => Promise<ActionState>;
}

/** Uma ocorrência: uma linha fechada, tudo ao abrir.
 *
 * O layout é GRID e não flex por um motivo prático: em grid as colunas de
 * seleção, selo e ações têm largura própria e o resumo fica com o resto,
 * então os botões ficam no mesmo lugar em qualquer largura de tela. Com
 * flex, o texto empurrava a lixeira para fora e era preciso rolar de lado
 * para alcançá-la.
 *
 * A rota saiu da linha fechada. Era a informação menos útil para decidir
 * se o erro importa, e a mais longa — continua visível ao abrir. */
export function ErroLinha({ erro, selecionado, aoSelecionar, aoExcluir }: Props) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  const resumo = resumirErro(erro.message);
  const Seta = aberto ? ChevronDown : ChevronRight;

  function marcar() {
    startTransition(async () => {
      const r = await marcarVisto(erro.id);
      if (r?.error) toast.error(r.error);
    });
  }

  return (
    <div className={erro.seen ? "opacity-60" : ""}>
      <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-2 py-1">
        <Checkbox
          checked={selecionado}
          onCheckedChange={aoSelecionar}
          aria-label={`Selecionar o erro de ${quando(erro.at)}`}
        />

        <SeloGravidade gravidade={erro.severity} />

        {/* O botão ocupa a coluna inteira do texto: a área de clique para
            abrir é a linha toda, não só a setinha. */}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex min-w-0 items-center gap-1.5 text-left"
        >
          <Seta className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
            {quando(erro.at)}
          </span>
          <span className="min-w-0 truncate text-sm">{resumo}</span>
        </button>

        <div className="flex items-center">
          {!erro.seen && (
            <Button
              size="sm"
              variant="ghost"
              className="size-7 p-0"
              onClick={marcar}
              disabled={pending}
              aria-label="Marcar como visto"
              title="Marcar como visto"
            >
              <CircleCheck className="size-4" />
            </Button>
          )}
          <DeleteButton
            action={aoExcluir}
            title="Apagar este registro?"
            description="Some com esta ocorrência. Não pode ser desfeito."
            confirmLabel="Apagar"
          />
        </div>
      </div>

      {aberto && (
        <div className="mb-2 ml-6 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{quando(erro.at)}</span>
            {erro.route && (
              <span className="font-mono break-all">
                {erro.method} {erro.route}
              </span>
            )}
            {erro.digest && <span className="font-mono">código {erro.digest}</span>}
            {erro.seen && <span>Já visto</span>}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">Mensagem completa</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed break-words whitespace-pre-wrap">
              {erro.message}
            </pre>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">Pilha</p>
            {erro.stack ? (
              <pre className="max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed">
                {erro.stack}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sem pilha registrada para esta ocorrência.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
