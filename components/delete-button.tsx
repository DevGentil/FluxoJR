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
import { Trash2 } from "lucide-react";
import type { ActionState } from "@/lib/actions-utils";

interface Props {
  action: () => Promise<ActionState>;
  title?: string;
  description?: string;
  /** O verbo do botão que confirma. Nem toda remoção é exclusão: desativar
   * um acesso é reversível, e chamar isso de "Excluir" assusta à toa. */
  confirmLabel?: string;
}

export function DeleteButton({
  action,
  title = "Excluir registro?",
  description = "Essa ação não pode ser desfeita.",
  confirmLabel = "Excluir",
}: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon" />}>
        <Trash2 className="size-4 text-destructive" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={handleDelete}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
