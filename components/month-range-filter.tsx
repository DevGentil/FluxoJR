"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, ArrowRight } from "lucide-react";

interface Preset {
  label: string;
  from: string;
  to: string;
}

interface Props {
  presets: Preset[];
  range: { from: string; to: string } | null;
}

/** Filtro de período por mês (competência), compartilhado entre "Repasses
 * por período" e "Métricas de Custo" — os dois lêem o mesmo searchParams
 * de página, então escolher aqui também atualiza o outro. Atalhos rápidos
 * + intervalo customizado (inputs type="month", não type="date", já que os
 * repasses são lançados por mês, não por dia) + "Tudo" pra limpar.
 *
 * router.push + router.refresh em vez de <Link> puro — lição já registrada
 * pra esse app: navegar só por query string às vezes reaproveitava RSC
 * cache velho.
 */
export function MonthRangeFilter({ presets, range }: Props) {
  const router = useRouter();
  const activePreset = range && presets.find((p) => p.from === range.from && p.to === range.to)?.label;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <CalendarDays className="size-4" />
          Período
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={range === null ? "default" : "outline"}
            onClick={() => {
              router.push("/repasses-medicos");
              router.refresh();
            }}
          >
            Tudo
          </Button>
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              size="sm"
              variant={activePreset === p.label ? "default" : "outline"}
              onClick={() => {
                router.push(`/repasses-medicos?from=${p.from}&to=${p.to}`);
                router.refresh();
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <form
        key={range ? `${range.from}-${range.to}` : "all"}
        className="flex flex-wrap items-end gap-3"
        method="GET"
      >
        <span className="text-sm text-muted-foreground pb-1.5 hidden sm:inline">Ou personalizado:</span>
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs text-muted-foreground">
            De
          </Label>
          <Input id="from" name="from" type="month" defaultValue={range?.from} className="w-36" />
        </div>
        <ArrowRight className="size-4 text-muted-foreground mb-2 hidden sm:block" />
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs text-muted-foreground">
            Até
          </Label>
          <Input id="to" name="to" type="month" defaultValue={range?.to} className="w-36" />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Aplicar
        </Button>
      </form>
    </div>
  );
}
