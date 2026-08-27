"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Preset {
  label: string;
  from: string;
  to: string;
}

interface Props {
  basePath: string;
  presets: Preset[];
}

/** Atalhos de período (Hoje / Esta semana / Este mês). Usa router.push +
 * router.refresh em vez de <Link> puro porque, nesta versão do Next.js, a
 * navegação só por query string entre presets às vezes reaproveitava o
 * cache do cliente e não buscava os dados novos do servidor — o clique
 * mudava a URL mas os números da tela ficavam parados no período anterior. */
export function DateRangePresets({ basePath, presets }: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <Button
          key={p.label}
          size="sm"
          variant="outline"
          onClick={() => {
            router.push(`${basePath}?from=${p.from}&to=${p.to}`);
            router.refresh();
          }}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
