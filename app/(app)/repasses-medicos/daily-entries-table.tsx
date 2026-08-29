"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { DailyEntryFormDialog, type DoctorOption } from "./daily-entry-form-dialog";
import { deleteDailyEntry } from "./daily-entries-actions";
import { PaidToggle } from "./paid-toggle";

export interface DailyEntryRow {
  id: string;
  date: Date;
  doctorId: string;
  doctorName: string;
  amount: number | null;
  paid: boolean;
  notes: string | null;
  /** Valor efetivo: o digitado ou a soma das linhas. */
  value: number;
  lines: { id: string; serviceItemId: string; serviceItemName: string; quantity: number; rate: number }[];
}

interface Props {
  entries: DailyEntryRow[];
  doctors: DoctorOption[];
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Lançamentos diários agrupados por mês — a mesma organização das
 * planilhas por médico, onde cada aba é um mês com uma linha por dia. */
export function DailyEntriesTable({ entries, doctors }: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isSearching = search.trim().length > 0;
  const filtered = useMemo(() => {
    if (!isSearching) return entries;
    const q = search.trim().toLowerCase();
    return entries.filter((e) => e.doctorName.toLowerCase().includes(q));
  }, [entries, search, isSearching]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; anchor: Date; rows: DailyEntryRow[] }>();
    for (const e of filtered) {
      const key = e.date.toISOString().slice(0, 7);
      const g = map.get(key) ?? { key, anchor: e.date, rows: [] };
      g.rows.push(e);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered]);

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
            <TableHead>Mês / Dia</TableHead>
            <TableHead>Médico</TableHead>
            <TableHead>Detalhe</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="w-20">Pago</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {isSearching ? "Nenhum lançamento para essa busca." : "Nenhum dia lançado ainda."}
              </TableCell>
            </TableRow>
          )}
          {groups.map((group) => {
            const isOpen = isSearching || !collapsed.has(group.key);
            const total = group.rows.reduce((s, r) => s + r.value, 0);
            const pagos = group.rows.filter((r) => r.paid).length;
            return (
              <Fragment key={group.key}>
                <TableRow
                  className="cursor-pointer bg-muted/40 hover:bg-muted/40"
                  onClick={() => toggle(group.key)}
                >
                  <TableCell className="font-semibold capitalize">
                    <span className="flex items-center gap-1.5">
                      {isOpen ? (
                        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                      )}
                      {monthLabel(group.anchor)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Set(group.rows.map((r) => r.doctorId)).size} médico(s)
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{group.rows.length} dia(s)</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(total)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {pagos}/{group.rows.length}
                  </TableCell>
                  <TableCell />
                </TableRow>
                {isOpen &&
                  group.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-6 text-muted-foreground tabular-nums">
                        {formatDate(r.date)}
                      </TableCell>
                      <TableCell>{r.doctorName}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {r.lines.length > 0 ? (
                          r.lines
                            .map((l) => `${l.quantity}× ${l.serviceItemName}`)
                            .join(", ")
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            valor do dia
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(r.value)}
                      </TableCell>
                      <TableCell>
                        <PaidToggle entryId={r.id} paid={r.paid} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <DailyEntryFormDialog
                            doctors={doctors}
                            entry={{
                              id: r.id,
                              doctorId: r.doctorId,
                              date: r.date,
                              amount: r.amount,
                              paid: r.paid,
                              notes: r.notes,
                              lines: r.lines,
                            }}
                          />
                          <DeleteButton
                            action={deleteDailyEntry.bind(null, r.id)}
                            title={`Excluir o lançamento de ${r.doctorName} em ${formatDate(r.date)}?`}
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
