"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Lock, LockOpen } from "lucide-react";
import { formatMonth } from "@/lib/format";
import { fecharMes, reabrirMes } from "./period-actions";

interface Props {
  mes: string;
  fechado: boolean;
  podeFechar: boolean;
  podeReabrir: boolean;
  lancamentos: number;
}

/** O cadeado do mês, na própria linha do mês.
 *
 * Fica aqui e não numa tela separada porque fechar o mês é o último passo da
 * conferência — e a conferência acontece olhando esta lista. */
export function FechamentoMes({ mes, fechado, podeFechar, podeReabrir, lancamentos }: Props) {
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [abrirDialogo, setAbrirDialogo] = useState(false);

  function fechar() {
    startTransition(async () => {
      const r = await fecharMes(mes);
      if (r?.error) toast.error(r.error);
      else toast.success(`${formatMonth(mes)} fechado.`);
      setAbrirDialogo(false);
    });
  }

  function reabrir() {
    startTransition(async () => {
      const r = await reabrirMes(mes, motivo);
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`${formatMonth(mes)} reaberto.`);
      setMotivo("");
      setAbrirDialogo(false);
    });
  }

  // Fechado e sem poder reabrir: mostra o cadeado e para por aí. Um botão que
  // só serve para dar erro depois do clique é pior do que botão nenhum.
  if (fechado && !podeReabrir) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Lock className="size-3" />
        Fechado
      </Badge>
    );
  }

  if (fechado) {
    return (
      <AlertDialog open={abrirDialogo} onOpenChange={setAbrirDialogo}>
        <AlertDialogTrigger
          render={<Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" />}
        >
          <Lock className="size-3.5" />
          Fechado
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="first-letter:uppercase">
              Reabrir {formatMonth(mes)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os {lancamentos} lançamentos do mês voltam a poder ser alterados e excluídos. A reabertura
              fica registrada na Auditoria com o seu nome e o motivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`motivo-${mes}`}>Por que precisa reabrir?</Label>
            <Input
              id={`motivo-${mes}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: repasse do Dr. X lançado em duplicidade"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={pending || motivo.trim().length < 5} onClick={reabrir}>
              <LockOpen className="size-4" />
              Reabrir mês
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (!podeFechar) return null;

  return (
    <AlertDialog open={abrirDialogo} onOpenChange={setAbrirDialogo}>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" className="gap-1" />}>
        <LockOpen className="size-3.5" />
        Fechar mês
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="first-letter:uppercase">Fechar {formatMonth(mes)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Os {lancamentos} lançamentos do mês deixam de poder ser criados, alterados ou excluídos. É o
            que garante que o que já foi conferido e pago não muda depois. Só o gestor da unidade ou a
            holding conseguem reabrir.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button disabled={pending} onClick={fechar}>
            <Lock className="size-4" />
            Fechar mês
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
