"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { EXTENSOES_ACEITAS, MAX_ANEXOS } from "@/lib/anexos-limites";

/** Um anexo já gravado. */
export interface AnexoSalvo {
  id: string;
  fileName: string;
  size: number;
}

interface Props {
  /** Anexos que já existem — só aparecem na edição. */
  existentes?: AnexoSalvo[];
  /** Remove um anexo já gravado. Sem isto, os existentes ficam só de leitura. */
  aoRemover?: (id: string) => Promise<{ error?: string } | undefined>;
  /** Avisa quais arquivos foram escolhidos.
   *
   * Só é preciso onde o diálogo não é um `<form>` — o fechamento de caixa
   * monta um objeto com as linhas do dia e chama a action direto, então
   * não há FormData para o `name="anexos"` viajar dentro. */
  aoEscolherArquivos?: (arquivos: File[]) => void;
}

function formatarTamanho(bytes: number) {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
}

/** Campo opcional de nota fiscal e comprovante.
 *
 * Fica no fim do formulário, depois dos campos que decidem o lançamento:
 * anexar é o passo acessório e não pode dar a impressão de ser obrigatório
 * para salvar. Por isso também o rótulo diz "opcional" em vez de deixar a
 * pessoa deduzir pela ausência do asterisco. */
export function CampoAnexos({ existentes = [], aoRemover, aoEscolherArquivos }: Props) {
  const [selecionados, setSelecionados] = useState<File[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);

  // O que já foi removido some na hora, sem esperar o servidor. Não é
  // enfeite: a lista chega como propriedade do render do diálogo, e o
  // `revalidatePath` da action não redesenha um diálogo que já está
  // aberto. Sem isto o arquivo continuava na tela depois de apagado, e o
  // segundo clique dava "Anexo não encontrado".
  const visiveis = existentes.filter((a) => !removidos.includes(a.id));
  const restantes = MAX_ANEXOS - visiveis.length;

  function aoEscolher(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(event.target.files ?? []);
    setSelecionados(arquivos);
    aoEscolherArquivos?.(arquivos);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="anexos" className="flex items-center gap-1.5">
        <Paperclip className="size-3.5 text-muted-foreground" />
        Nota fiscal ou comprovante
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </Label>

      {visiveis.length > 0 && (
        <ul className="space-y-1">
          {visiveis.map((anexo) => (
            <li
              key={anexo.id}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={`/api/documents/${anexo.id}`}
                className="min-w-0 flex-1 truncate underline-offset-4 hover:underline"
                title={anexo.fileName}
              >
                {anexo.fileName}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatarTamanho(anexo.size)}
              </span>
              {aoRemover && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label={`Remover ${anexo.fileName}`}
                  onClick={async () => {
                    // Fora de `startTransition` de propósito: dentro dele o
                    // React adia o redesenho até a ação assíncrona terminar,
                    // e o arquivo continuava na tela mesmo depois de apagado
                    // do banco. Aqui o sumiço é imediato, como se espera de
                    // um clique em "remover".
                    setRemovidos((atuais) => [...atuais, anexo.id]);
                    const r = await aoRemover(anexo.id);
                    if (r?.error) {
                      // Falhou: o arquivo continua lá, então volta para a
                      // lista em vez de sumir mentindo que foi removido.
                      setRemovidos((atuais) => atuais.filter((id) => id !== anexo.id));
                      toast.error(r.error);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {restantes > 0 ? (
        <>
          <input
            id="anexos"
            name="anexos"
            type="file"
            multiple
            accept={EXTENSOES_ACEITAS}
            onChange={aoEscolher}
            className="block w-full cursor-pointer text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
          />
          {selecionados.length > 0 && (
            /* Confirmação do que foi escolhido: o campo nativo mostra só
               "N arquivos" quando há mais de um, e a pessoa não tem como
               conferir se pegou o arquivo certo antes de salvar. */
            <ul className="space-y-1">
              {selecionados.map((arquivo) => (
                <li key={arquivo.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{arquivo.name}</span>
                  <span className="shrink-0">· {formatarTamanho(arquivo.size)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            PDF, XML da nota ou imagem, até 10MB cada.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Limite de {MAX_ANEXOS} anexos atingido. Remova um para adicionar outro.
        </p>
      )}
    </div>
  );
}
