"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import type { DoctorPaymentModel } from "./doctors-actions";

type Granularity = "month" | "quarter" | "semester" | "year";

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "month", label: "Mensal" },
  { value: "quarter", label: "Trimestral" },
  { value: "semester", label: "Semestral" },
  { value: "year", label: "Anual" },
];

function periodKey(date: Date, granularity: Granularity) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-11
  switch (granularity) {
    case "month":
      return `${y}-${String(m + 1).padStart(2, "0")}`;
    case "quarter":
      return `${y}-Q${Math.floor(m / 3) + 1}`;
    case "semester":
      return `${y}-S${Math.floor(m / 6) + 1}`;
    case "year":
      return `${y}`;
  }
}

function periodLabel(date: Date, granularity: Granularity) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  switch (granularity) {
    case "month":
      return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    case "quarter":
      return `${Math.floor(m / 3) + 1}º trimestre de ${y}`;
    case "semester":
      return `${Math.floor(m / 6) + 1}º semestre de ${y}`;
    case "year":
      return `${y}`;
  }
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

interface DoctorTotals {
  doctorId: string;
  doctorName: string;
  consultationCount: number;
  examCount: number;
  hoursWorked: number;
  consultationValue: number;
  examValue: number;
  hourlyValue: number;
  totalValue: number;
}

function emptyDoctorTotals(doctorId: string, doctorName: string): DoctorTotals {
  return {
    doctorId,
    doctorName,
    consultationCount: 0,
    examCount: 0,
    hoursWorked: 0,
    consultationValue: 0,
    examValue: 0,
    hourlyValue: 0,
    totalValue: 0,
  };
}

function addReport(totals: DoctorTotals, r: ReportRow) {
  totals.consultationCount += r.consultationCount;
  totals.examCount += r.examCount;
  totals.hoursWorked += r.hoursWorked ?? 0;
  totals.consultationValue += r.consultationValue;
  totals.examValue += r.examValue;
  totals.hourlyValue += r.hourlyValue;
  totals.totalValue += r.totalValue;
}

/** Agrega os repasses de um período (que pode juntar vários meses, no caso
 * de trimestre/semestre/ano) por médico, pra alimentar as linhas de
 * detalhe expandidas — mesmas colunas do agregado da unidade, só que por
 * médico dentro daquele período. */
function aggregateByDoctor(reports: ReportRow[]): DoctorTotals[] {
  const map = new Map<string, DoctorTotals>();
  for (const r of reports) {
    const entry = map.get(r.doctorId) ?? emptyDoctorTotals(r.doctorId, r.doctorName);
    addReport(entry, r);
    map.set(r.doctorId, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.doctorName.localeCompare(b.doctorName));
}

interface Props {
  reports: ReportRow[];
}

/** Uma única tabela de métricas, agrupada por período (mensal, trimestral,
 * semestral ou anual — escolha do usuário) no mesmo padrão de colapsar/
 * expandir de ReportsTable. A linha do período traz o rendimento e o
 * valor consolidado da unidade naquele intervalo, e expandir mostra o
 * mesmo detalhamento por médico (agregado quando o período junta vários
 * meses). Evita espalhar a mesma informação em várias tabelas separadas. */
export function MetricsTable({ reports }: Props) {
  const [search, setSearch] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());

  function togglePeriod(key: string) {
    setExpandedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // A busca por médico ignora o agrupamento por período e mostra direto os
  // períodos com pelo menos um médico batendo com o nome — mesmo padrão da
  // busca em ReportsTable ("Repasses por período").
  const isSearching = search.trim().length > 0;
  const filteredReports = useMemo(() => {
    if (!isSearching) return reports;
    const q = search.trim().toLowerCase();
    return reports.filter((r) => r.doctorName.toLowerCase().includes(q));
  }, [reports, search, isSearching]);

  // Agrupa por período (não assume blocos adjacentes — trimestre/semestre/
  // ano pode juntar meses que hoje vêm em ordem desc mas não precisam ser
  // contíguos se houver um mês sem repasse lançado no meio).
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; anchor: Date; reports: ReportRow[] }>();
    for (const r of filteredReports) {
      const key = periodKey(r.competencia, granularity);
      const entry = map.get(key);
      if (entry) {
        entry.reports.push(r);
        if (r.competencia > entry.anchor) entry.anchor = r.competencia;
      } else {
        map.set(key, { key, anchor: r.competencia, reports: [r] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.anchor.getTime() - a.anchor.getTime());
  }, [filteredReports, granularity]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {GRANULARITY_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              size="sm"
              variant={granularity === opt.value ? "default" : "outline"}
              onClick={() => setGranularity(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="relative max-w-xs w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por médico..."
            className="pl-8"
          />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período / Médico</TableHead>
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
                {isSearching
                  ? "Nenhum médico encontrado para essa busca."
                  : "Sem repasses lançados ainda para calcular métricas."}
              </TableCell>
            </TableRow>
          )}
          {groups.map((group) => {
            const isExpanded = isSearching || expandedPeriods.has(group.key);
            const consultas = group.reports.reduce((s, r) => s + r.consultationCount, 0);
            const exames = group.reports.reduce((s, r) => s + r.examCount, 0);
            const horas = group.reports.reduce((s, r) => s + (r.hoursWorked ?? 0), 0);
            const valorConsultas = group.reports.reduce((s, r) => s + r.consultationValue, 0);
            const valorExames = group.reports.reduce((s, r) => s + r.examValue, 0);
            const valorPlantao = group.reports.reduce((s, r) => s + r.hourlyValue, 0);
            const valorTotal = valorConsultas + valorExames + valorPlantao;
            const doctorTotals = aggregateByDoctor(group.reports);
            return (
              <Fragment key={group.key}>
                <TableRow
                  className={
                    isSearching ? "bg-muted/40 hover:bg-muted/40" : "cursor-pointer bg-muted/40 hover:bg-muted/40"
                  }
                  onClick={isSearching ? undefined : () => togglePeriod(group.key)}
                >
                  <TableCell className="font-semibold capitalize">
                    <span className="flex items-center gap-1.5">
                      {!isSearching &&
                        (isExpanded ? (
                          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                        ))}
                      {periodLabel(group.anchor, granularity)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{consultas}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{exames}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{horas > 0 ? horas : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {ratioLabel(consultas, exames)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {percentLabel(consultas, exames)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatCurrency(valorConsultas)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatCurrency(valorExames)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatCurrency(valorPlantao)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(valorTotal)}</TableCell>
                </TableRow>
                {isExpanded &&
                  doctorTotals.map((d) => (
                    <TableRow key={d.doctorId}>
                      <TableCell className="pl-6 text-muted-foreground">{d.doctorName}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.consultationCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.examCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.hoursWorked > 0 ? d.hoursWorked : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ratioLabel(d.consultationCount, d.examCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {percentLabel(d.consultationCount, d.examCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(d.consultationValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(d.examValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(d.hourlyValue)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(d.totalValue)}
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
