"use client";

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  balance: { label: "Saldo projetado", color: "var(--chart-3)" },
} satisfies ChartConfig;

interface Props {
  data: { label: string; balance: number }[];
}

export function ProjectionChart({ data }: Props) {
  return (
    <ChartContainer config={chartConfig} className="h-72 w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v / 1000}k`} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="balance" stroke="var(--color-balance)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
