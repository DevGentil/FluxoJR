"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
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
  basePath: string;
  presets: Preset[];
  range: { from: string; to: string };
}

/** Filtro de período compartilhado por Relatórios e Balanço: atalhos rápidos
 * (destacando o que está ativo) + intervalo customizado, num único cartão.
 *
 * Usa router.push + router.refresh em vez de <Link> puro nos atalhos —
 * nesta versão do Next.js, navegar só por query string entre presets às
 * vezes reaproveitava o cache do cliente e não buscava os dados novos do
 * servidor. A key no formulário força os campos de data a remontar a cada
 * período novo (evita o aviso do Base UI sobre defaultValue mudando depois
 * do input já ter montado).
 */
export function PeriodFilter({ basePath, presets, range }: Props) {
  const router = useRouter();
  const activePreset = presets.find((p) => p.from === range.from && p.to === range.to)?.label;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarDays className="size-4" />
            Período
          </span>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant={activePreset === p.label ? "default" : "outline"}
                onClick={() => {
                  router.push(`${basePath}?from=${p.from}&to=${p.to}`);
                  router.refresh();
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border" />

        <form
          key={`${range.from}-${range.to}`}
          className="flex flex-wrap items-end gap-3"
          method="GET"
        >
          <span className="text-sm text-muted-foreground pb-1.5 hidden sm:inline">
            Ou personalizado:
          </span>
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              De
            </Label>
            <Input id="from" name="from" type="date" defaultValue={range.from} className="w-40" />
          </div>
          <ArrowRight className="size-4 text-muted-foreground mb-2 hidden sm:block" />
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              Até
            </Label>
            <Input id="to" name="to" type="date" defaultValue={range.to} className="w-40" />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Aplicar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
