"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import type { DoctorPaymentModel } from "./doctors-actions";

function formatCompetencia(value: Date) {
  return value.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function ratioLabel(consultas: number, exames: number) {
  return exames > 0 ? `${(consultas / exames).toFixed(1)} : 1` : "—";
}

function percentLabel(consultas: number, exames: number) {
  return consultas > 0 ? `${((exames / consultas) * 100).toFixed(1)}%` : "—";
}

interface ReportRow {
  id: string;
  competencia: Date;
  doctorId: string;
  doctorName: string;
  paymentModel: DoctorPaymentModel;
  consultationCount: number;
  examCount: number;
  consultationValue: number;
  examValue: number;
  hoursWorked: number | null;
  hourlyValue: number;
  totalValue: number;
}

interface Props {
  reports: ReportRow[];
}

/** Uma única tabela de métricas, agrupada por mês (mesmo padrão de
 * colapsar/expandir de ReportsTable) — a linha do mês traz o rendimento e
 * o valor consolidado da unidade naquele período, e expandir mostra o
 * mesmo detalhamento por médico. Evita espalhar a mesma informação em
 * várias tabelas separadas. */
export function MetricsTable({ reports }: Props) {
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Já vem ordenado por competência desc, depois médico asc (da query).
  const groups = useMemo(() => {
    const result: { key: string; competencia: Date; reports: ReportRow[] }[] = [];
    for (const r of reports) {
      const key = r.competencia.toISOString().slice(0, 7);
      const last = result[result.length - 1];
      if (last && last.key === key) last.reports.push(r);
      else result.push({ key, competencia: r.competencia, reports: [r] });
    }
    return result;
  }, [reports]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mês / Médico</TableHead>
          <TableHead className="text-right">Consultas</TableHead>
          <TableHead className="text-right">Exames</TableHead>
          <TableHead className="text-right">Horas</TableHead>
          <TableHead className="text-right">Consultas por exame</TableHead>
          <TableHead className="text-right">% conversão</TableHead>
          <TableHead className="text-right">Valor consultas</TableHead>
          <TableHead className="text-right">Valor exames</TableHead>
          <TableHead className="text-right">Valor plantão</TableHead>
          <TableHead className="text-right">Valor total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.length === 0 && (
          <TableRow>
            <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
              Sem repasses lançados ainda para calcular métricas.
            </TableCell>
          </TableRow>
        )}
        {groups.map((group) => {
          const isExpanded = expandedMonths.has(group.key);
          const consultas = group.reports.reduce((s, r) => s + r.consultationCount, 0);
          const exames = group.reports.reduce((s, r) => s + r.examCount, 0);
          const horas = group.reports.reduce((s, r) => s + (r.hoursWorked ?? 0), 0);
          const valorConsultas = group.reports.reduce((s, r) => s + r.consultationValue, 0);
          const valorExames = group.reports.reduce((s, r) => s + r.examValue, 0);
          const valorPlantao = group.reports.reduce((s, r) => s + r.hourlyValue, 0);
          const valorTotal = valorConsultas + valorExames + valorPlantao;
          return (
            <Fragment key={group.key}>
              <TableRow
                className="cursor-pointer bg-muted/40 hover:bg-muted/40"
                onClick={() => toggleMonth(group.key)}
              >
                <TableCell className="font-semibold capitalize">
                  <span className="flex items-center gap-1.5">
                    {isExpanded ? (
                      <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                    )}
                    {formatCompetencia(group.competencia)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{consultas}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{exames}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{horas > 0 ? horas : "—"}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{ratioLabel(consultas, exames)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {percentLabel(consultas, exames)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatCurrency(valorConsultas)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(valorExames)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(valorPlantao)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(valorTotal)}</TableCell>
              </TableRow>
              {isExpanded &&
                group.reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6 text-muted-foreground">{r.doctorName}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.consultationCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.examCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.hoursWorked ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ratioLabel(r.consultationCount, r.examCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {percentLabel(r.consultationCount, r.examCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.consultationValue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.examValue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.hourlyValue)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(r.totalValue)}
                    </TableCell>
                  </TableRow>
                ))}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
