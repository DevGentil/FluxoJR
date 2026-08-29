import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

interface Props {
  label: string;
  value: string;
  /** Linha pequena embaixo do número, para o contexto que explica o valor
   * ("3 de 7 dias", "24,3% do total"). */
  hint?: string;
  icon: LucideIcon;
  iconClass: string;
}

export function KpiCard({ label, value, hint, icon: Icon, iconClass }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className={`size-4 ${iconClass}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
