"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TableDisclosure } from "@/components/table-disclosure";
import { CircleCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteButton } from "@/components/delete-button";
import type { ActionState } from "@/lib/actions-utils";
import { marcarVisto } from "./actions";
import { resumirErro } from "@/lib/erro-resumo";

export interface Erro {
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

interface Props {
  erro: Erro;
  selecionado: boolean;
  aoSelecionar: () => void;
  aoExcluir: () => Promise<ActionState>;
}

/** Uma ocorrência: uma linha fechada, tudo ao abrir.
 *
 * Fechada, mostra o RESUMO — a causa em uma linha — e nada mais. A
 * mensagem crua do Prisma tem quinze linhas e a lista virava um paredão
 * onde não se distinguia um erro do outro.
 *
 * Aberta, mostra a mensagem inteira e depois a pilha. Antes só a pilha
 * aparecia, então o texto completo do erro não existia em lugar nenhum
 * da tela. */
export function ErroLinha({ erro, selecionado, aoSelecionar, aoExcluir }: Props) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  const resumo = resumirErro(erro.message);

  function marcar() {
    startTransition(async () => {
      const r = await marcarVisto(erro.id);
      if (r?.error) toast.error(r.error);
    });
  }

  return (
    <div className={`py-1.5 ${erro.seen ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-3">
        <Checkbox
          checked={selecionado}
          onCheckedChange={aoSelecionar}
          aria-label={`Selecionar o erro de ${quando(erro.at)}`}
        />
        <div className="min-w-0 flex-1">
          <TableDisclosure
            open={aberto}
            onToggle={() => setAberto((v) => !v)}
            label={`o erro de ${quando(erro.at)}`}
          >
            {/* Data e rota na MESMA linha do resumo: eram uma segunda linha
                por registro, e com 25 por página isso dobrava a altura da
                tabela sem acrescentar nada que não coubesse aqui. */}
            <span className="flex min-w-0 items-baseline gap-2 text-sm">
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                {quando(erro.at)}
              </span>
              {/* `min-w-0` junto do `truncate`: item de flex não encolhe
                  abaixo do próprio conteúdo sem isso, e o resumo longo
                  empurrava a página inteira para o lado. */}
              <span className="min-w-0 truncate">{resumo}</span>
            </span>
          </TableDisclosure>
        </div>

        {/* Sem `shrink-0`: a rota cede espaço quando a tela aperta, em vez
            de empurrar a página para o lado. Ela é a informação menos
            importante da linha e já aparece inteira ao abrir. */}
        {erro.route && (
          <span className="hidden min-w-0 truncate font-mono text-xs text-muted-foreground sm:block sm:max-w-[16rem]">
            {erro.route}
          </span>
        )}

        <div className="flex shrink-0 items-center">
          {!erro.seen && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={marcar}
              disabled={pending}
              aria-label="Marcar como visto"
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
        <div className="mt-2 ml-[22px] space-y-3 pb-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{quando(erro.at)}</span>
            {erro.route && (
              <span className="font-mono">
                {erro.method} {erro.route}
              </span>
            )}
            {erro.digest && <span className="font-mono">código {erro.digest}</span>}
            {erro.seen && <span>Já visto</span>}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">Mensagem completa</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
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
