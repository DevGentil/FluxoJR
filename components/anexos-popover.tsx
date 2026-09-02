"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, FileText, Paperclip } from "lucide-react";
import type { AnexoSalvo } from "@/components/campo-anexos";

interface Props {
  anexos: AnexoSalvo[];
  /** O que o arquivo acompanha, para o título dizer de onde ele veio. */
  titulo: string;
}

function formatarTamanho(bytes: number) {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
}

/** O clipe que aparece na tabela quando o lançamento tem nota ou
 * comprovante.
 *
 * Some quando não há anexo, em vez de virar um ícone apagado em toda
 * linha: numa tabela de centenas, o que informa é a exceção, e um clipe
 * cinza repetido em tudo vira ruído que ninguém mais enxerga.
 *
 * A contagem fica no próprio botão porque "tem anexo" e "tem três" levam
 * a decisões diferentes na hora de conferir. */
export function AnexosPopover({ anexos, titulo }: Props) {
  const [aberto, setAberto] = useState(false);

  if (anexos.length === 0) return null;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-1.5 text-muted-foreground"
            aria-label={`Ver ${anexos.length} anexo(s)`}
            title={`${anexos.length} anexo(s)`}
          />
        }
      >
        <Paperclip className="size-3.5" />
        <span className="text-xs tabular-nums">{anexos.length}</span>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anexos</DialogTitle>
          <DialogDescription className="truncate">{titulo}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5">
          {anexos.map((anexo) => (
            <li
              key={anexo.id}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-sm"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={anexo.fileName}>
                {anexo.fileName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatarTamanho(anexo.size)}
              </span>
              {/* Link direto para a rota do arquivo: ela já confere o escopo
                  da empresa e devolve com o nome original. */}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                nativeButton={false}
                render={<a href={`/api/documents/${anexo.id}`} aria-label={`Baixar ${anexo.fileName}`} />}
              >
                <Download className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
