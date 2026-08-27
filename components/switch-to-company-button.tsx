"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { setActiveScope } from "@/app/(app)/scope-actions";

interface Props {
  companyId: string;
  label?: string;
}

/** Troca o escopo ativo para uma empresa específica e atualiza a página
 * atual — usado nas visões consolidadas para ir direto ao detalhe de uma
 * unidade sem precisar abrir o seletor no menu lateral. */
export function SwitchToCompanyButton({ companyId, label = "Ver detalhes" }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await setActiveScope(`company:${companyId}`);
      router.refresh();
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} disabled={isPending}>
      {label}
      <ArrowRight className="size-4" />
    </Button>
  );
}
