"use client";

import { Fragment, useMemo, useState } from "react";
import { Info, Search } from "lucide-react";
import { TableDisclosure } from "@/components/table-disclosure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/format";
import { GRANULARITY_OPTIONS, periodOf, type Granularity } from "@/lib/periods";
import { toMonthKey } from "@/lib/date-only";

function ratioLabel(consultas: number, exames: number) {
  return exames > 0 ? `${(consultas / exames).toFixed(1)} : 1` : "—";
}

function percentLabel(consultas: number, exames: number) {
  return formatPercent(exames, consultas);
}

/** Sem receita não há valor a mostrar — evita exibir "R$ 0,00" como se
 * fosse um número apurado quando na verdade o item não tem preço. */
function moneyOrDash(v: number) {
  return v > 0 ? formatCurrency(v) : "—";
}

function marginLabel(revenue: number, profit: number) {
  return revenue > 0 ? formatPercent(profit, revenue) : "—";
}

function profitClass(revenue: number, profit: number, strong: boolean) {
  const base = `text-right tabular-nums ${strong ? "font-semibold" : ""}`;
  if (revenue <= 0) return `${base} text-muted-foreground`;
  return profit < 0 ? `${base} text-destructive` : base;
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
  /** Parte do repasse lançada só como valor do dia, sem detalhe por item —
   * entra no custo mas não tem como virar contagem nem margem. */
  undetailedValue: number;
  revenue: number;
  tax: number;
  operationalCost: number;
  unpricedCost: number;
  profit: number;
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
  undetailedValue: number;
  revenue: number;
  tax: number;
  operationalCost: number;
  unpricedCost: number;
  profit: number;
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
    undetailedValue: 0,
    revenue: 0,
    tax: 0,
    operationalCost: 0,
    unpricedCost: 0,
    profit: 0,
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
    entry.undetailedValue += r.undetailedValue;
    entry.revenue += r.revenue;
    entry.tax += r.tax;
    entry.operationalCost += r.operationalCost;
    entry.unpricedCost += r.unpricedCost;
    entry.profit += r.profit;
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
      const key = periodOf(toMonthKey(r.competencia), granularity).key;
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

  const semPreco = filteredRows.reduce((acc, r) => acc + r.unpricedCost, 0);
  const semDetalhe = filteredRows.reduce((acc, r) => acc + r.undetailedValue, 0);

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
      {semPreco > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0 mt-0.5" />
          {formatCurrency(semPreco)} de repasse em itens sem preço cadastrado (plantão, auxílio ou preço ainda
          em branco). Entram no repasse, mas ficam de fora da receita e da margem — senão a conta compararia a
          receita de alguns itens com o custo de todos.
        </p>
      )}
      {semDetalhe > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0 mt-0.5" />
          {formatCurrency(semDetalhe)} lançados só como valor do dia, sem detalhe por item. Contam no repasse,
          mas não em consultas, exames nem margem — para o dia aparecer nessas colunas, detalhe os itens no
          lançamento.
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período / {entityLabel}</TableHead>
            <TableHead className="text-right">Consultas</TableHead>
            <TableHead className="text-right">Exames</TableHead>
            <TableHead className="text-right">Plantão</TableHead>
            <TableHead className="hidden xl:table-cell text-right">Consultas por exame</TableHead>
            <TableHead className="text-right">% conversão</TableHead>
            <TableHead className="text-right">Receita</TableHead>
            <TableHead className="text-right">Repasse</TableHead>
            <TableHead className="hidden lg:table-cell text-right">Encargos + insumo</TableHead>
            <TableHead className="text-right">Lucro</TableHead>
            <TableHead className="text-right">Margem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
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
            const valorTotal = group.rows.reduce((s, r) => s + r.totalValue, 0);
            const receita = group.rows.reduce((s, r) => s + r.revenue, 0);
            const encargos = group.rows.reduce((s, r) => s + r.tax + r.operationalCost, 0);
            const lucro = group.rows.reduce((s, r) => s + r.profit, 0);
            const entityTotals = aggregateByEntity(group.rows);
            return (
              <Fragment key={group.key}>
                <TableRow
                  className={
                    isSearching ? "bg-muted/40 hover:bg-muted/40" : "cursor-pointer bg-muted/40 hover:bg-muted/40"
                  }
                  onClick={isSearching ? undefined : () => togglePeriod(group.key)}
                >
                  <TableCell className="font-semibold first-letter:uppercase">
                    {isSearching ? (
                      periodOf(toMonthKey(group.anchor), granularity, "longo").label
                    ) : (
                      <TableDisclosure
                        open={isExpanded}
                        onToggle={() => togglePeriod(group.key)}
                        label={periodOf(toMonthKey(group.anchor), granularity, "longo").label}
                      >
                        <span className="first-letter:uppercase">
                          {periodOf(toMonthKey(group.anchor), granularity, "longo").label}
                        </span>
                      </TableDisclosure>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{consultas}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{exames}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{horas > 0 ? horas : "—"}</TableCell>
                  <TableCell className="hidden xl:table-cell text-right tabular-nums font-semibold">
                    {ratioLabel(consultas, exames)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {percentLabel(consultas, exames)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{moneyOrDash(receita)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(valorTotal)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-right tabular-nums font-semibold">
                    {moneyOrDash(encargos)}
                  </TableCell>
                  <TableCell className={profitClass(receita, lucro, true)}>{receita > 0 ? formatCurrency(lucro) : "—"}</TableCell>
                  <TableCell className={profitClass(receita, lucro, true)}>{marginLabel(receita, lucro)}</TableCell>
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
                      <TableCell className="hidden xl:table-cell text-right tabular-nums">
                        {ratioLabel(e.consultationCount, e.examCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {percentLabel(e.consultationCount, e.examCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{moneyOrDash(e.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(e.totalValue)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">
                        {moneyOrDash(e.tax + e.operationalCost)}
                      </TableCell>
                      <TableCell className={profitClass(e.revenue, e.profit, false)}>
                        {e.revenue > 0 ? formatCurrency(e.profit) : "—"}
                      </TableCell>
                      <TableCell className={profitClass(e.revenue, e.profit, false)}>
                        {marginLabel(e.revenue, e.profit)}
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
