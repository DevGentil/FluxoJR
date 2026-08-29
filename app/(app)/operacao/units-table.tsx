"use client";

import { useMemo, useState } from "react";
import { TableDisclosure } from "@/components/table-disclosure";
import { LocalSortableHead, useLocalSort } from "@/components/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { formatCurrency, formatPercent } from "@/lib/format";
import { sortBy } from "@/lib/sorting";

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
/** Como cada coluna vira um número comparável.
 *
 * Conversão e margem são razões, não colunas guardadas: ordenar pelo texto
 * "12,3%" colocaria 9% depois de 12%. Unidade sem denominador vai para o
 * fim, com `null` — é "não dá para calcular", não "zero por cento". */
const CHAVES = {
  unidade: (u: UnitRow) => u.name,
  medicos: (u: UnitRow) => u.doctors,
  consultas: (u: UnitRow) => u.consultas,
  exames: (u: UnitRow) => u.exames,
  conversao: (u: UnitRow) => (u.consultas > 0 ? u.exames / u.consultas : null),
  custo: (u: UnitRow) => u.total,
  lucro: (u: UnitRow) => (u.revenue > 0 ? u.profit : null),
  margem: (u: UnitRow) => (u.revenue > 0 ? u.profit / u.revenue : null),
} satisfies Record<string, (u: UnitRow) => string | number | null>;

type Coluna = keyof typeof CHAVES;

export function UnitsTable({ units }: { units: UnitRow[] }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const { sort, onSort } = useLocalSort<Coluna>({ field: "custo", dir: "desc" });

  const { active, empty, grandTotal } = useMemo(() => {
    const withMovement = units.filter((u) => u.total > 0 || u.consultas > 0 || u.exames > 0);
    return {
      active: sortBy(withMovement, CHAVES[sort.field], sort.dir),
      empty: units.filter((u) => !withMovement.includes(u)),
      grandTotal: units.reduce((s, u) => s + u.total, 0),
    };
  }, [units, sort]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <LocalSortableHead field="unidade" sort={sort} onSort={onSort}>
            Unidade
          </LocalSortableHead>
          <LocalSortableHead
            field="medicos"
            sort={sort}
            onSort={onSort}
            first="desc"
            align="right"
            className="hidden lg:table-cell text-right"
          >
            Médicos ativos
          </LocalSortableHead>
          <LocalSortableHead field="consultas" sort={sort} onSort={onSort} first="desc" align="right" className="text-right">
            Consultas
          </LocalSortableHead>
          <LocalSortableHead field="exames" sort={sort} onSort={onSort} first="desc" align="right" className="text-right">
            Exames
          </LocalSortableHead>
          <LocalSortableHead field="conversao" sort={sort} onSort={onSort} first="desc" align="right" className="text-right">
            % conversão
          </LocalSortableHead>
          <LocalSortableHead field="custo" sort={sort} onSort={onSort} first="desc" align="right" className="text-right">
            Custo total
          </LocalSortableHead>
          <LocalSortableHead field="lucro" sort={sort} onSort={onSort} first="desc" align="right" className="text-right">
            Lucro
          </LocalSortableHead>
          <LocalSortableHead field="margem" sort={sort} onSort={onSort} first="desc" align="right" className="text-right">
            Margem
          </LocalSortableHead>
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
              <TableDisclosure
                open={showEmpty}
                onToggle={() => setShowEmpty((v) => !v)}
                label="as unidades sem movimento"
              >
                {empty.length} unidade(s) sem movimento no período
              </TableDisclosure>
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
