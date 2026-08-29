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

// Mesmas cores já usadas nas barras de ranking da página: azul = consultas,
// âmbar = exames; violeta entra para plantão (conceito novo).
const compositionConfig = {
  consultas: { label: "Consultas", color: "#0ea5e9" },
  exames: { label: "Exames", color: "#f59e0b" },
  plantao: { label: "Plantão", color: "#8b5cf6" },
} satisfies ChartConfig;

interface CompositionPoint {
  label: string;
  consultas: number;
  exames: number;
  plantao: number;
}

/** Composição do custo de repasse mês a mês — do holding inteiro na visão
 * consolidada, da unidade na visão de empresa. Empilhado com 3 séries fixas
 * (não uma por unidade/médico) para continuar legível conforme o número de
 * unidades ou de médicos cresce. */
export function CostCompositionChart({ data }: { data: CompositionPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sem repasses lançados ainda para montar o gráfico.
      </p>
    );
  }

  // Há meses, mas todas as barras seriam zero: é o caso de quem lança só o
  // valor do dia, sem dizer o que foi feito. Um eixo vazio parecia defeito;
  // dizer o motivo aponta o caminho.
  const temComposicao = data.some((m) => m.consultas > 0 || m.exames > 0 || m.plantao > 0);
  if (!temComposicao) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center max-w-md mx-auto">
        Os lançamentos do período vieram só como valor do dia, sem detalhe por item — não há como separar
        consulta, exame e plantão. Detalhe os itens ao lançar para este gráfico aparecer.
      </p>
    );
  }

  return (
    <ChartContainer config={compositionConfig} className="h-64 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="consultas" stackId="custo" fill="var(--color-consultas)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="exames" stackId="custo" fill="var(--color-exames)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="plantao" stackId="custo" fill="var(--color-plantao)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

const conversionConfig = {
  conversao: { label: "% conversão", color: "#f59e0b" },
} satisfies ChartConfig;

interface ConversionPoint {
  name: string;
  conversao: number;
}

/** Eficiência comercial: % das consultas que viraram exame, por unidade na
 * visão consolidada e por médico na visão de empresa. Diferente do ranking
 * por valor/volume, compara desempenho e não tamanho — uma unidade pequena
 * (ou um médico com poucas consultas) pode converter melhor que o maior. */
export function ConversionChart({
  data,
  emptyMessage,
  labelWidth = 110,
}: {
  data: ConversionPoint[];
  emptyMessage: string;
  labelWidth?: number;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{emptyMessage}</p>;
  }

  return (
    <ChartContainer config={conversionConfig} className="h-64 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 12, right: 32 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={labelWidth} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${Number(v).toFixed(1)}%`} />} />
        <Bar dataKey="conversao" fill="var(--color-conversao)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
