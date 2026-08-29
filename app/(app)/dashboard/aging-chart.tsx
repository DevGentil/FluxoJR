"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/format";

const config = {
  pagar: { label: "A pagar", color: "var(--chart-2)" },
  receber: { label: "A receber", color: "var(--chart-1)" },
} satisfies ChartConfig;

export interface AgingBucket {
  label: string;
  pagar: number;
  receber: number;
}

/** Vencimentos por faixa de prazo.
 *
 * Substituiu a projeção de saldo, que somava o saldo atual às contas
 * pendentes e desenhava uma linha até 90 dias — uma previsão frágil, porque
 * depende de tudo ser pago no dia certo e ignora o que ainda nem foi
 * lançado. Isto aqui não prevê nada: mostra o que JÁ está comprometido e
 * quando vence. É a pergunta que se responde antes de decidir um pagamento
 * — "o que aperta nesta semana?" — e ela tem resposta exata. */
export function AgingChart({ data }: { data: AgingBucket[] }) {
  const vazio = data.every((b) => b.pagar === 0 && b.receber === 0);
  if (vazio) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Nenhuma conta a pagar ou a receber em aberto.
      </p>
    );
  }

  return (
    <ChartContainer config={config} className="h-72 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="receber" fill="var(--color-receber)" radius={4} />
        <Bar dataKey="pagar" fill="var(--color-pagar)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
