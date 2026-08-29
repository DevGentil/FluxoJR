import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export interface KpiDelta {
  /** Valor do período anterior, para comparar. */
  previous: number;
  /** Valor do período atual. */
  current: number;
  /** O que a comparação é: "vs. mês anterior". */
  label: string;
  /** Subir é bom? Verdadeiro para receita, falso para despesa. */
  goodWhenUp?: boolean;
}

interface Props {
  label: string;
  value: string;
  /** Linha pequena embaixo do número, para o contexto que explica o valor
   * ("3 de 7 dias", "24,3% do total"). */
  hint?: string;
  /** Variação contra o período anterior. Um número sozinho não diz se está
   * bom: R$ 20 mil de entrada é ótimo depois de um mês de R$ 12 mil e
   * ruim depois de um de R$ 40 mil. */
  delta?: KpiDelta;
  icon: LucideIcon;
  iconClass: string;
}

function DeltaLine({ previous, current, label, goodWhenUp = true }: KpiDelta) {
  // Sem base de comparação não há percentual honesto a mostrar — de zero
  // para qualquer coisa é "infinito por cento".
  if (previous === 0) {
    return <p className="text-xs text-muted-foreground mt-1">Sem {label.replace(/^vs\.?\s*/i, "")} para comparar</p>;
  }

  const percent = ((current - previous) / Math.abs(previous)) * 100;
  const subiu = percent > 0.05;
  const desceu = percent < -0.05;
  const bom = subiu ? goodWhenUp : desceu ? !goodWhenUp : null;

  const Icon = subiu ? ArrowUpRight : desceu ? ArrowDownRight : Minus;
  const color =
    bom === null
      ? "text-muted-foreground"
      : bom
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";

  return (
    <p className={`flex items-center gap-1 text-xs mt-1 ${color}`}>
      <Icon className="size-3 shrink-0" />
      <span className="tabular-nums">{Math.abs(percent).toFixed(1)}%</span>
      <span className="text-muted-foreground">{label}</span>
    </p>
  );
}

export function KpiCard({ label, value, hint, delta, icon: Icon, iconClass }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className={`size-4 ${iconClass}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {delta && <DeltaLine {...delta} />}
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
