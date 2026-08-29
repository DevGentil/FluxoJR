"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { formatCurrency, formatPercent } from "@/lib/format";

export interface UnitRow {
  id: string;
  name: string;
  doctors: number;
  consultas: number;
  exames: number;
  total: number;
  revenue: number;
  profit: number;
}

function UnitCells({ u, grandTotal }: { u: UnitRow; grandTotal: number }) {
  const semReceita = u.revenue <= 0;
  const marginClass = semReceita
    ? "text-right tabular-nums text-muted-foreground"
    : `text-right tabular-nums ${u.profit < 0 ? "text-destructive" : ""}`;

  return (
    <>
      <TableCell className="hidden lg:table-cell text-right tabular-nums">{u.doctors}</TableCell>
      <TableCell className="text-right tabular-nums">{u.consultas}</TableCell>
      <TableCell className="text-right tabular-nums">{u.exames}</TableCell>
      <TableCell className="text-right tabular-nums">{formatPercent(u.exames, u.consultas)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(u.total)}</TableCell>
      <TableCell className={marginClass}>
        {semReceita ? "—" : formatCurrency(u.profit)}
      </TableCell>
      <TableCell className={marginClass}>{semReceita ? "—" : formatPercent(u.profit, u.revenue)}</TableCell>
      <TableCell className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">
        {formatPercent(u.total, grandTotal)}
      </TableCell>
    </>
  );
}

/** Comparativo entre unidades da holding.
 *
 * Duas correções em relação à primeira versão: a tabela mostrava consultas e
 * custo mas não margem, então quem parava aqui via menos do que quem rolava
 * até as Métricas logo abaixo; e as unidades sem nenhum movimento — quatro
 * de sete no cenário atual — ocupavam metade da altura com zeros. Elas agora
 * ficam recolhidas atrás de uma linha, ainda a um clique de distância porque
 * "por que essa unidade está zerada?" é uma pergunta legítima. */
export function UnitsTable({ units }: { units: UnitRow[] }) {
  const [showEmpty, setShowEmpty] = useState(false);

  const { active, empty, grandTotal } = useMemo(() => {
    const withMovement = units.filter((u) => u.total > 0 || u.consultas > 0 || u.exames > 0);
    return {
      active: [...withMovement].sort((a, b) => b.total - a.total),
      empty: units.filter((u) => !withMovement.includes(u)),
      grandTotal: units.reduce((s, u) => s + u.total, 0),
    };
  }, [units]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Unidade</TableHead>
          <TableHead className="hidden lg:table-cell text-right">Médicos ativos</TableHead>
          <TableHead className="text-right">Consultas</TableHead>
          <TableHead className="text-right">Exames</TableHead>
          <TableHead className="text-right">% conversão</TableHead>
          <TableHead className="text-right">Custo total</TableHead>
          <TableHead className="text-right">Lucro</TableHead>
          <TableHead className="text-right">Margem</TableHead>
          <TableHead className="hidden lg:table-cell text-right">% do grupo</TableHead>
          <TableHead className="w-32" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {units.length === 0 && (
          <TableRow>
            <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
              Nenhuma empresa nesse escopo.
            </TableCell>
          </TableRow>
        )}
        {active.map((u) => (
          <TableRow key={u.id}>
            <TableCell className="font-medium">{u.name}</TableCell>
            <UnitCells u={u} grandTotal={grandTotal} />
            <TableCell>
              <div className="flex justify-end">
                <SwitchToCompanyButton companyId={u.id} label="Ver detalhes" />
              </div>
            </TableCell>
          </TableRow>
        ))}

        {empty.length > 0 && (
          <TableRow
            className="cursor-pointer hover:bg-muted/40"
            onClick={() => setShowEmpty((v) => !v)}
          >
            <TableCell colSpan={10} className="text-muted-foreground text-sm">
              <span className="flex items-center gap-1.5">
                {showEmpty ? (
                  <ChevronDown className="size-4 shrink-0" />
                ) : (
                  <ChevronRight className="size-4 shrink-0" />
                )}
                {empty.length} unidade(s) sem movimento no período
              </span>
            </TableCell>
          </TableRow>
        )}
        {showEmpty &&
          empty.map((u) => (
            <TableRow key={u.id} className="text-muted-foreground">
              <TableCell className="pl-8">{u.name}</TableCell>
              <UnitCells u={u} grandTotal={grandTotal} />
              <TableCell>
                <div className="flex justify-end">
                  <SwitchToCompanyButton companyId={u.id} label="Ver detalhes" />
                </div>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
