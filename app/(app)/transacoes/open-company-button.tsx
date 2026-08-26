"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setActiveScope } from "@/app/(app)/scope-actions";

export function OpenCompanyButton({ companyId }: { companyId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await setActiveScope(`company:${companyId}`);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
      Ver transações
      <ArrowRight className="size-4" />
    </Button>
  );
}
