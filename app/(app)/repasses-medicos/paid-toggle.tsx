"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { toggleDailyEntryPaid } from "./daily-entries-actions";

/** O "PG" que a planilha anota à mão na coluna de observação. Marcar direto
 * na linha evita ter que abrir o lançamento só pra dar baixa. */
export function PaidToggle({ entryId, paid }: { entryId: string; paid: boolean }) {
  const [checked, setChecked] = useState(paid);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: boolean) {
    const previous = checked;
    setChecked(value);
    startTransition(async () => {
      const result = await toggleDailyEntryPaid(entryId, value);
      if (result.error) {
        setChecked(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <Checkbox
      checked={checked}
      disabled={isPending}
      onCheckedChange={(c) => handleChange(Boolean(c))}
      aria-label={checked ? "Marcado como pago" : "Marcar como pago"}
    />
  );
}
