"use client";

import { useMemo, useState } from "react";
import { Bar, ComposedChart, CartesianGrid, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { GRANULARITY_OPTIONS, groupByPeriod, type Granularity, type MonthTotals } from "@/lib/periods";

/** Quantos períodos de cada granularidade cabem no gráfico sem virar
 * espaguete: um ano de meses, dois de trimestres, três de semestres. */
const JANELA: Record<Granularity, number> = { month: 12, quarter: 8, semester: 6, year: 4 };

const chartConfig = {
  income: { label: "Entradas", color: "var(--chart-1)" },
  expense: { label: "Saídas", color: "var(--chart-2)" },
  net: { label: "Resultado", color: "var(--chart-4)" },
} satisfies ChartConfig;

function Variacao({ atual, anterior }: { atual: number; anterior: number | null }) {
  if (anterior === null || anterior === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  const subiu = pct > 0.05;
  const desceu = pct < -0.05;
  const Icon = subiu ? ArrowUpRight : desceu ? ArrowDownRight : Minus;
  const cor = subiu
    ? "text-emerald-600 dark:text-emerald-400"
    : desceu
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${cor}`}>
      <Icon className="size-3 shrink-0" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** Comparativo de desempenho ao longo do tempo, na granularidade que a
 * pergunta pedir.
 *
 * O Balanço respondia bem "como foi este período" e nada sobre "e antes?".
 * Um resultado de R$ 40 mil não diz nada sozinho — diz tudo comparado com os
 * R$ 12 mil do trimestre anterior. As quatro granularidades saem da MESMA
 * leitura de meses, agrupada aqui, então trocar entre elas é instantâneo e
 * não volta ao banco. */
export function ComparisonDashboard({ months }: { months: MonthTotals[] }) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const janela = JANELA[granularity];

  const periodos = useMemo(
    () => groupByPeriod(months, granularity).slice(-janela),
    [months, granularity, janela]
  );

  // Da tabela para baixo, do mais recente para o mais antigo — é como se lê
  // um histórico. O gráfico continua no sentido do tempo.
  const linhas = [...periodos].reverse();

  const totalReceita = periodos.reduce((s, p) => s + p.income, 0);
  const totalDespesa = periodos.reduce((s, p) => s + p.expense, 0);
  const melhor = periodos.reduce<(typeof periodos)[number] | null>(
    (max, p) => (max === null || p.net > max.net ? p : max),
    null
  );
  const pior = periodos.reduce<(typeof periodos)[number] | null>(
    (min, p) => (min === null || p.net < min.net ? p : min),
    null
  );

  if (periodos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sem movimentação lançada para comparar períodos.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {GRANULARITY_OPTIONS.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={granularity === o.value ? "default" : "outline"}
            onClick={() => setGranularity(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Entradas no intervalo</p>
          <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalReceita)}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Saídas no intervalo</p>
          <p className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatCurrency(totalDespesa)}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Melhor período</p>
          <p className="text-lg font-semibold tabular-nums">
            {melhor ? `${melhor.label} · ${formatCurrency(melhor.net)}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Pior período</p>
          <p className="text-lg font-semibold tabular-nums">
            {pior ? `${pior.label} · ${formatCurrency(pior.net)}` : "—"}
          </p>
        </div>
      </div>

      <ChartContainer config={chartConfig} className="h-80 w-full">
        <ComposedChart data={periodos}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="income" fill="var(--color-income)" radius={4} />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={4} />
          <Line
            type="monotone"
            dataKey="net"
            stroke="var(--color-net)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ChartContainer>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead className="text-right">Entradas</TableHead>
            <TableHead className="text-right">Saídas</TableHead>
            <TableHead className="text-right">Resultado</TableHead>
            <TableHead className="text-right">Margem</TableHead>
            <TableHead className="text-right">vs. anterior</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((p) => {
            // O anterior no tempo, não na tabela — que está invertida.
            const i = periodos.findIndex((x) => x.key === p.key);
            const anterior = i > 0 ? periodos[i - 1] : null;
            return (
              <TableRow key={p.key}>
                <TableCell className="font-medium">{p.label}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(p.income)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                  {formatCurrency(p.expense)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-medium ${p.net < 0 ? "text-destructive" : ""}`}
                >
                  {formatCurrency(p.net)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {p.income > 0 ? `${((p.net / p.income) * 100).toFixed(1)}%` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Variacao atual={p.net} anterior={anterior?.net ?? null} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
