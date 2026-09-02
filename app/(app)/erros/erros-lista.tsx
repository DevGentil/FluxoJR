"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
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
  excluirFiltrados,
  marcarTodosVistos,
} from "./actions";

interface Props {
  erros: Erro[];
  /** Quantos registros passaram de `DIAS_ANTIGO`, no banco inteiro. */
  antigos: number;
  /** Quantos o filtro atual alcança, somando todas as páginas. */
  totalFiltrado: number;
  naoVistos: number;
  /** O filtro ativo, para "Selecionar tudo" apagar exatamente o que ele mostra. */
  filtro: { gravidade?: string; estado?: string };
  /** Os botões de filtro, montados no servidor e encaixados aqui para
   * ficarem na mesma linha da seleção. */
  filtros: ReactNode;
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
      <AlertDialogTrigger render={<Button size="sm" variant={variante} className="h-7" />}>
        {variante === "destructive" ? (
          <Trash2 className="size-3.5" />
        ) : (
          <Eraser className="size-3.5" />
        )}
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

/** A lista de erros com filtro, seleção e limpeza.
 *
 * A seleção vive aqui, e não em cada linha, porque "apagar selecionados"
 * precisa saber de todas ao mesmo tempo. */
export function ErrosLista({
  erros,
  antigos,
  totalFiltrado,
  naoVistos,
  filtro,
  filtros,
}: Props) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  /** "Selecionar tudo" alcança as outras páginas, então não dá para
   * representá-lo por uma lista de ids — é um modo, não uma seleção. */
  const [modoTudo, setModoTudo] = useState(false);
  const [pending, startTransition] = useTransition();

  const ids = useMemo(() => Array.from(selecionados), [selecionados]);
  const quantidade = modoTudo ? totalFiltrado : selecionados.size;
  const paginaInteira = erros.length > 0 && selecionados.size === erros.length;

  function alternar(id: string) {
    if (modoTudo) {
      // Desmarcar uma linha sai do "tudo" e cai na página visível menos
      // ela: continuar dizendo "tudo" com uma exceção seria mentira.
      setModoTudo(false);
      setSelecionados(new Set(erros.map((e) => e.id).filter((outro) => outro !== id)));
      return;
    }
    setSelecionados((atuais) => {
      const proximo = new Set(atuais);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function alternarTudo() {
    const marcado = modoTudo || paginaInteira;
    setModoTudo(!marcado);
    setSelecionados(marcado ? new Set() : new Set(erros.map((e) => e.id)));
  }

  /** Devolve o resultado para o diálogo cuidar do aviso, e só limpa a
   * seleção quando deu certo — senão a pessoa perderia o que marcou por
   * causa de uma falha de rede. */
  async function apagarSelecionados() {
    const r = modoTudo ? await excluirFiltrados(filtro) : await excluirErros(ids);
    if (!r?.error) {
      setSelecionados(new Set());
      setModoTudo(false);
    }
    return r;
  }

  const filtrando = Boolean(filtro.gravidade || filtro.estado);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-2">
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={modoTudo || paginaInteira}
            onCheckedChange={alternarTudo}
            aria-label="Selecionar tudo"
          />
          Selecionar tudo
        </label>

        {filtros}

        <div className="ml-auto flex items-center gap-2">
          {naoVistos > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => startTransition(() => marcarTodosVistos())}
              disabled={pending}
            >
              <CircleCheck className="size-3.5" />
              Marcar vistos
            </Button>
          )}

          {antigos > 0 && (
            <BotaoApagar
              rotulo={`Antigos (${antigos})`}
              titulo={`Apagar ${antigos} registro(s) com mais de ${DIAS_ANTIGO} dias?`}
              descricao="A limpeza de rotina. Erro de mês passado já não vai ser investigado, visto ou não."
              acao={excluirAntigos}
            />
          )}

          {quantidade > 0 && (
            <BotaoApagar
              rotulo={`Apagar (${quantidade})`}
              titulo={`Apagar ${quantidade} registro(s)?`}
              descricao={
                modoTudo && filtrando
                  ? "Tudo que o filtro atual mostra, inclusive nas outras páginas. Não pode ser desfeito."
                  : modoTudo
                    ? "O histórico inteiro de erros, inclusive os de hoje. Não pode ser desfeito."
                    : "Só os que você marcou. Não pode ser desfeito."
              }
              acao={apagarSelecionados}
              variante="destructive"
            />
          )}
        </div>
      </div>

      <div className="divide-y">
        {erros.map((e) => (
          <ErroLinha
            key={e.id}
            erro={e}
            selecionado={modoTudo || selecionados.has(e.id)}
            aoSelecionar={() => alternar(e.id)}
            aoExcluir={() => excluirErro(e.id)}
          />
        ))}
      </div>
    </div>
  );
}
