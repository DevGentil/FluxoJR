"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CircleCheck, Eraser, Trash2 } from "lucide-react";
import { ErroLinha, type Erro } from "./erro-linha";
import { DIAS_ANTIGO } from "./constantes";
import {
  excluirAntigos,
  excluirErro,
  excluirErros,
  excluirTodos,
  marcarTodosVistos,
} from "./actions";

interface Props {
  erros: Erro[];
  /** Quantos registros passaram de `DIAS_ANTIGO`, no banco inteiro. */
  antigos: number;
  total: number;
  naoVistos: number;
}

/** Botão que pede confirmação antes de apagar.
 *
 * A confirmação diz o NÚMERO de registros, não "esses itens": apagar é
 * irreversível e o tamanho do estrago é a informação que decide. */
function BotaoApagar({
  rotulo,
  titulo,
  descricao,
  acao,
  variante = "outline",
}: {
  rotulo: string;
  titulo: string;
  descricao: string;
  acao: () => Promise<{ error?: string } | undefined>;
  variante?: "outline" | "destructive";
}) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant={variante} />}>
        {variante === "destructive" ? <Trash2 className="size-4" /> : <Eraser className="size-4" />}
        {rotulo}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await acao();
                if (r?.error) toast.error(r.error);
                else toast.success("Registros apagados.");
              })
            }
          >
            Apagar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A lista de erros com as ações de limpeza.
 *
 * A seleção vive aqui e não em cada linha porque "apagar selecionados"
 * precisa saber de todas ao mesmo tempo. */
export function ErrosLista({ erros, antigos, total, naoVistos }: Props) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const ids = useMemo(() => Array.from(selecionados), [selecionados]);
  const todosMarcados = erros.length > 0 && selecionados.size === erros.length;

  function alternar(id: string) {
    setSelecionados((atuais) => {
      const proximo = new Set(atuais);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function alternarTodos() {
    // Marca só o que está NESTA página: dizer "todos" e apagar registros
    // que a pessoa não está vendo seria uma armadilha. Para o resto,
    // existem os botões de limpeza.
    setSelecionados(todosMarcados ? new Set() : new Set(erros.map((e) => e.id)));
  }

  /** Devolve o resultado para o diálogo cuidar do aviso, e só limpa a
   * seleção quando deu certo — senão a pessoa perderia o que marcou e
   * teria que remarcar tudo por causa de uma falha de rede. */
  async function apagarSelecionados() {
    const r = await excluirErros(ids);
    if (!r?.error) setSelecionados(new Set());
    return r;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {naoVistos > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => startTransition(() => marcarTodosVistos())}
            disabled={pending}
          >
            <CircleCheck className="size-4" />
            Marcar todos como vistos
          </Button>
        )}

        {antigos > 0 && (
          <BotaoApagar
            rotulo={`Apagar antigos (${antigos})`}
            titulo={`Apagar ${antigos} registro(s) com mais de ${DIAS_ANTIGO} dias?`}
            descricao="A limpeza de rotina. Erro de mês passado já não vai ser investigado, visto ou não."
            acao={excluirAntigos}
          />
        )}

        {total > 0 && (
          <BotaoApagar
            rotulo="Apagar tudo"
            titulo={`Apagar todos os ${total} registros?`}
            descricao="Some com o histórico inteiro de erros, inclusive os de hoje. Não pode ser desfeito."
            acao={excluirTodos}
            variante="destructive"
          />
        )}
      </div>

      {erros.length > 0 && (
        <div className="flex items-center gap-3 border-b pb-2">
          <Checkbox
            checked={todosMarcados}
            onCheckedChange={alternarTodos}
            aria-label="Selecionar todos desta página"
          />
          <span className="text-xs text-muted-foreground">
            {selecionados.size > 0
              ? `${selecionados.size} selecionado(s)`
              : "Selecionar desta página"}
          </span>
          {selecionados.size > 0 && (
            <BotaoApagar
              rotulo={`Apagar selecionados (${selecionados.size})`}
              titulo={`Apagar ${selecionados.size} registro(s)?`}
              descricao="Só os que você marcou. Não pode ser desfeito."
              acao={apagarSelecionados}
              variante="destructive"
            />
          )}
        </div>
      )}

      <div className="divide-y">
        {erros.map((e) => (
          <ErroLinha
            key={e.id}
            erro={e}
            selecionado={selecionados.has(e.id)}
            aoSelecionar={() => alternar(e.id)}
            aoExcluir={() => excluirErro(e.id)}
          />
        ))}
      </div>
    </div>
  );
}
