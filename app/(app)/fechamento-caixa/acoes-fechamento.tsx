"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { CheckCircle2, RotateCcw } from "lucide-react";
import { aprovarFechamento, reabrirFechamento } from "./actions";

interface Props {
  id: string;
  aprovado: boolean;
  /** Quanto entra de receita e quanto sai de despesa, para a confirmação
   * dizer o tamanho do que está sendo autorizado. */
  sangrias: string;
  pagamentos: string;
  /** Sem nível de aprovação, os botões nem aparecem — o Operacional lança
   * e para por aí. */
  podeAprovar: boolean;
}

export function AcoesFechamento({ id, aprovado, sangrias, pagamentos, podeAprovar }: Props) {
  const [pending, startTransition] = useTransition();

  if (!podeAprovar) return null;

  const acao = aprovado ? reabrirFechamento : aprovarFechamento;
  const Icone = aprovado ? RotateCcw : CheckCircle2;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            size="sm"
            variant={aprovado ? "ghost" : "outline"}
            className="h-7"
            title={aprovado ? "Reabrir para corrigir" : "Aprovar e lançar no resultado"}
          />
        }
      >
        <Icone className="size-3.5" />
        <span className="hidden lg:inline">{aprovado ? "Reabrir" : "Aprovar"}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{aprovado ? "Reabrir este fechamento?" : "Aprovar este fechamento?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {aprovado
              ? "Os lançamentos saem do resultado e o dia volta a ficar editável."
              : `Entram ${sangrias} de receita e ${pagamentos} de despesa no resultado da unidade.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await acao(id);
                if (r?.error) toast.error(r.error);
                else toast.success(aprovado ? "Fechamento reaberto." : "Fechamento aprovado.");
              })
            }
          >
            {aprovado ? "Reabrir" : "Aprovar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
