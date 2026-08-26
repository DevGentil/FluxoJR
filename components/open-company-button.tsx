"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setActiveScope } from "@/app/(app)/scope-actions";

interface Props {
  companyId: string;
  href: string;
  label?: string;
}

export function OpenCompanyButton({ companyId, href, label = "Abrir" }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  function handleClick() {
    startTransition(async () => {
      await setActiveScope(`company:${companyId}`);
      if (pathname === href) router.refresh();
      else router.push(href);
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
      {label}
      <ArrowRight className="size-4" />
    </Button>
  );
}
