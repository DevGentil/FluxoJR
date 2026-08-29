"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markContractChecked } from "./doctors-actions";

/** "Conferi e continua certo" — registra a data sem mexer em valor nenhum.
 * Na planilha a coluna "Última conferência" existia mas ficou 100% vazia,
 * justamente porque conferir sem alterar não deixava rastro em lugar
 * nenhum. */
export function CheckContractButton({ doctorId, doctorName }: { doctorId: string; doctorName: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={`Marcar o contrato de ${doctorName} como conferido hoje`}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await markContractChecked(doctorId);
          if (result.error) toast.error(result.error);
          else toast.success("Contrato marcado como conferido.");
        })
      }
    >
      <CheckCheck className="size-4" />
    </Button>
  );
}
