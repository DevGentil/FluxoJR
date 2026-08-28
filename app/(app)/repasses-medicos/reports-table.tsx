"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { ReportFormDialog, type DoctorOption } from "./report-form-dialog";
import { deletePeriodReport } from "./reports-actions";
import { formatCurrency } from "@/lib/format";

function formatCompetencia(value: Date) {
  return value.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

interface ReportRow {
  id: string;
  competencia: Date;
  doctorId: string;
  doctorName: string;
  consultationCount: number;
  examCount: number;
  consultationValue: number;
  examValue: number;
  hoursWorked: number | null;
  hourlyValue: number;
  totalValue: number;
  notes: string | null;
  lines: { id: string; serviceItemId: string; quantity: number }[];
}

interface Props {
  reports: ReportRow[];
  doctors: DoctorOption[];
}

/** Agrupa os repasses por mês (uma linha resumo por mês, clicável pra
 * expandir o detalhe por médico) em vez de listar cada médico solto — com
 * muitos médicos isso viraria uma lista enorme rapidinho. A busca por
 * médico ignora o agrupamento e mostra direto as linhas que baterem. */
export function ReportsTable({ reports, doctors }: Props) {
  const [search, setSearch] = useState("");
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isSearching = search.trim().length > 0;
  const filteredReports = useMemo(() => {
    if (!isSearching) return reports;
    const q = search.trim().toLowerCase();
    return reports.filter((r) => r.doctorName.toLowerCase().includes(q));
  }, [reports, search, isSearching]);

  // Já vem ordenado por competência desc, depois médico asc (da query) —
  // agrupa visualmente as linhas adjacentes do mesmo mês.
  const groups = useMemo(() => {
    const result: { key: string; competencia: Date; reports: ReportRow[] }[] = [];
    for (const r of filteredReports) {
      const key = r.competencia.toISOString().slice(0, 7);
      const last = result[result.length - 1];
      if (last && last.key === key) last.reports.push(r);
      else result.push({ key, competencia: r.competencia, reports: [r] });
    }
    return result;
  }, [filteredReports]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por médico..."
          className="pl-8"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mês</TableHead>
            <TableHead>Médico</TableHead>
            <TableHead className="text-right">Consultas</TableHead>
            <TableHead className="text-right">Exames</TableHead>
            <TableHead className="text-right">Plantão</TableHead>
            <TableHead className="text-right">Valor total</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {isSearching ? "Nenhum repasse encontrado para essa busca." : "Nenhum repasse lançado ainda."}
              </TableCell>
            </TableRow>
          )}
          {groups.map((group) => {
            const isExpanded = isSearching || expandedMonths.has(group.key);
            const consultationCount = group.reports.reduce((s, r) => s + r.consultationCount, 0);
            const examCount = group.reports.reduce((s, r) => s + r.examCount, 0);
            const hoursWorked = group.reports.reduce((s, r) => s + (r.hoursWorked ?? 0), 0);
            const totalValue = group.reports.reduce((s, r) => s + r.totalValue, 0);
            return (
              <Fragment key={group.key}>
                <TableRow
                  className={isSearching ? "bg-muted/40 hover:bg-muted/40" : "cursor-pointer bg-muted/40 hover:bg-muted/40"}
                  onClick={isSearching ? undefined : () => toggleMonth(group.key)}
                >
                  <TableCell className="font-semibold capitalize">
                    <span className="flex items-center gap-1.5">
                      {!isSearching &&
                        (isExpanded ? (
                          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                        ))}
                      {formatCompetencia(group.competencia)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{group.reports.length} médico(s)</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{consultationCount}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{examCount}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {hoursWorked > 0 ? hoursWorked : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(totalValue)}</TableCell>
                  <TableCell />
                </TableRow>
                {isExpanded &&
                  group.reports.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-6" />
                      <TableCell>{r.doctorName}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.consultationCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.examCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.hoursWorked ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(r.totalValue)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <ReportFormDialog
                            doctors={doctors}
                            report={{
                              id: r.id,
                              doctorId: r.doctorId,
                              competencia: r.competencia,
                              notes: r.notes,
                              lines: r.lines,
                            }}
                          />
                          <DeleteButton
                            action={deletePeriodReport.bind(null, r.id)}
                            title={`Excluir repasse de ${r.doctorName} — ${formatCompetencia(r.competencia)}?`}
                          />
                        </div>
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
