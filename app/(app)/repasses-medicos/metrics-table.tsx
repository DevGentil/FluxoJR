"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";

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

/** Uma linha de repasse já com os valores calculados, atribuída a uma
 * "entidade" — que é o médico na visão de uma empresa, e a própria empresa
 * na visão consolidada/holding. As métricas são as mesmas nos dois casos,
 * só muda o que está sendo comparado dentro do período. */
export interface MetricRow {
  id: string;
  competencia: Date;
  entityId: string;
  entityName: string;
  consultationCount: number;
  examCount: number;
  consultationValue: number;
  examValue: number;
  hoursWorked: number | null;
  hourlyValue: number;
  totalValue: number;
}

interface EntityTotals {
  entityId: string;
  entityName: string;
  consultationCount: number;
  examCount: number;
  hoursWorked: number;
  consultationValue: number;
  examValue: number;
  hourlyValue: number;
  totalValue: number;
}

function emptyTotals(entityId: string, entityName: string): EntityTotals {
  return {
    entityId,
    entityName,
    consultationCount: 0,
    examCount: 0,
    hoursWorked: 0,
    consultationValue: 0,
    examValue: 0,
    hourlyValue: 0,
    totalValue: 0,
  };
}

/** Agrega as linhas de um período (que pode juntar vários meses, no caso de
 * trimestre/semestre/ano) por entidade, pra alimentar as linhas de detalhe
 * expandidas — mesmas colunas do agregado, só que por médico/unidade. */
function aggregateByEntity(rows: MetricRow[]): EntityTotals[] {
  const map = new Map<string, EntityTotals>();
  for (const r of rows) {
    const entry = map.get(r.entityId) ?? emptyTotals(r.entityId, r.entityName);
    entry.consultationCount += r.consultationCount;
    entry.examCount += r.examCount;
    entry.hoursWorked += r.hoursWorked ?? 0;
    entry.consultationValue += r.consultationValue;
    entry.examValue += r.examValue;
    entry.hourlyValue += r.hourlyValue;
    entry.totalValue += r.totalValue;
    map.set(r.entityId, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
}

interface Props {
  rows: MetricRow[];
  /** Rótulo do que aparece ao expandir um período: "Médico" ou "Unidade". */
  entityLabel: string;
  searchPlaceholder: string;
}

/** Tabela de métricas agrupada por período (mensal, trimestral, semestral ou
 * anual — escolha do usuário) no mesmo padrão de colapsar/expandir de
 * ReportsTable. A linha do período traz o rendimento e o valor consolidado
 * do conjunto, e expandir mostra o mesmo detalhamento por entidade (médico
 * na visão de uma empresa, unidade na visão do holding), agregado quando o
 * período junta vários meses. */
export function MetricsTable({ rows, entityLabel, searchPlaceholder }: Props) {
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

  // A busca ignora o agrupamento por período e mostra direto os períodos com
  // pelo menos uma entidade batendo com o nome — mesmo padrão da busca em
  // ReportsTable ("Repasses por período").
  const isSearching = search.trim().length > 0;
  const filteredRows = useMemo(() => {
    if (!isSearching) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.entityName.toLowerCase().includes(q));
  }, [rows, search, isSearching]);

  // Agrupa por período (não assume blocos adjacentes — trimestre/semestre/ano
  // pode juntar meses que não são contíguos se houver um mês sem repasse
  // lançado no meio).
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; anchor: Date; rows: MetricRow[] }>();
    for (const r of filteredRows) {
      const key = periodKey(r.competencia, granularity);
      const entry = map.get(key);
      if (entry) {
        entry.rows.push(r);
        if (r.competencia > entry.anchor) entry.anchor = r.competencia;
      } else {
        map.set(key, { key, anchor: r.competencia, rows: [r] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.anchor.getTime() - a.anchor.getTime());
  }, [filteredRows, granularity]);

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
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período / {entityLabel}</TableHead>
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
                  ? "Nenhum resultado encontrado para essa busca."
                  : "Sem repasses lançados ainda para calcular métricas."}
              </TableCell>
            </TableRow>
          )}
          {groups.map((group) => {
            const isExpanded = isSearching || expandedPeriods.has(group.key);
            const consultas = group.rows.reduce((s, r) => s + r.consultationCount, 0);
            const exames = group.rows.reduce((s, r) => s + r.examCount, 0);
            const horas = group.rows.reduce((s, r) => s + (r.hoursWorked ?? 0), 0);
            const valorConsultas = group.rows.reduce((s, r) => s + r.consultationValue, 0);
            const valorExames = group.rows.reduce((s, r) => s + r.examValue, 0);
            const valorPlantao = group.rows.reduce((s, r) => s + r.hourlyValue, 0);
            const valorTotal = valorConsultas + valorExames + valorPlantao;
            const entityTotals = aggregateByEntity(group.rows);
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
                  entityTotals.map((e) => (
                    <TableRow key={e.entityId}>
                      <TableCell className="pl-6 text-muted-foreground">{e.entityName}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.consultationCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.examCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.hoursWorked > 0 ? e.hoursWorked : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ratioLabel(e.consultationCount, e.examCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {percentLabel(e.consultationCount, e.examCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(e.consultationValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(e.examValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(e.hourlyValue)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(e.totalValue)}
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
