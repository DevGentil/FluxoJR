"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { formatCurrency } from "@/lib/format";
import { computeMargin, type TaxBracketInput } from "@/lib/service-margin";
import {
  ServiceItemFormDialog,
  CATEGORY_LABELS,
  PAYER_LABELS,
  type ServiceItemFormValues,
} from "./service-item-form-dialog";
import { deleteServiceItem } from "./service-items-actions";

export interface CatalogRow extends ServiceItemFormValues {
  /** Repasses já contratados com médicos para este item. */
  doctorRates: { doctorName: string; rate: number }[];
}

interface Props {
  items: CatalogRow[];
  brackets: TaxBracketInput[];
  groups: string[];
}

const SEM_GRUPO = "Sem grupo";

/** Catálogo de serviços com a economia de cada item, agrupado pelo grupo
 * operacional (o mesmo agrupamento da planilha de exames, que é o que
 * define o custo de insumo).
 *
 * A coluna que interessa é "sobra p/ repasse": quanto resta depois dos encargos
 * (maquininha, impostos, demais custos proporcionais) e do custo de
 * insumo. É o teto do que dá para pagar ao
 * médico sem entrar no vermelho — e é exatamente a conta que faltava quando
 * os repasses foram negociados (na planilha, 24% dos procedimentos ficaram
 * com repasse acima desse teto). */
export function ServiceCatalogTable({ items, brackets, groups }: Props) {
  const [search, setSearch] = useState("");
  // Grupos fechados por padrão: são 124 itens no catálogo real, e abrir
  // tudo enterra o que interessa. A busca abre sozinha o que bater.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isSearching = search.trim().length > 0;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.group ?? "").toLowerCase().includes(q))
      .map((i) => {
        const margin = computeMargin({
          price: i.price,
          doctorRate: 0,
          operationalCost: i.operationalCost,
          brackets,
        });
        // Sem repasse, o "lucro" e o teto disponivel para pagar o medico.
        const available = margin?.profit ?? null;
        const maxRate = i.doctorRates.reduce((max, r) => Math.max(max, r.rate), 0);
        const overpaying =
          available != null && i.doctorRates.filter((r) => r.rate > available).map((r) => r.doctorName);
        // Item ativo que ninguém tem contratado não dá para lançar: o
        // formulário do dia só oferece o que está no contrato do médico.
        // Ou falta combinar o valor, ou o item deveria estar arquivado.
        const semContrato = i.active && i.doctorRates.length === 0;
        return { item: i, margin, available, maxRate, overpaying: overpaying || [], semContrato };
      });
  }, [items, search, brackets]);

  const groupsOfRows = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.item.group ?? SEM_GRUPO;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const emAlerta = rows.filter((r) => r.overpaying.length > 0).length;
  const semContrato = rows.filter((r) => r.semContrato).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          {emAlerta > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4 shrink-0" />
              {emAlerta} {emAlerta === 1 ? "item tem repasse" : "itens têm repasse"} acima do que sobra depois
              dos encargos — dá prejuízo a cada atendimento.
            </p>
          )}
          {semContrato > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-500">
              <TriangleAlert className="size-4 shrink-0" />
              {semContrato} {semContrato === 1 ? "item ativo não tem" : "itens ativos não têm"} nenhum médico
              com valor combinado — não dá para lançar.
            </p>
          )}
        </div>
        <div className="relative max-w-xs w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar item ou grupo..."
            className="pl-8"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Convênio</TableHead>
            <TableHead className="text-right">Valor cobrado</TableHead>
            <TableHead className="text-right">Encargos</TableHead>
            <TableHead className="text-right">Custo insumo</TableHead>
            <TableHead className="text-right">Sobra p/ repasse</TableHead>
            <TableHead className="text-right">Maior repasse</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                {isSearching ? "Nenhum item encontrado." : "Nenhum item no catálogo ainda."}
              </TableCell>
            </TableRow>
          )}
          {groupsOfRows.map(([group, groupRows]) => {
            const isOpen = isSearching || expanded.has(group);
            return (
              <Fragment key={group}>
                <TableRow
                  className="cursor-pointer bg-muted/40 hover:bg-muted/40"
                  onClick={() => toggle(group)}
                >
                  <TableCell colSpan={8} className="font-semibold">
                    <span className="flex items-center gap-1.5">
                      {isOpen ? (
                        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                      )}
                      {group}
                      <span className="text-muted-foreground font-normal text-sm">
                        · {groupRows.length} {groupRows.length === 1 ? "item" : "itens"}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell />
                </TableRow>
                {isOpen &&
                  groupRows.map(({ item, margin, available, maxRate, overpaying, semContrato }) => (
                    <TableRow key={item.id} className={item.active ? undefined : "opacity-50"}>
                      <TableCell className="pl-6 font-medium">
                        <span className="flex items-center gap-1.5">
                          {overpaying.length > 0 && (
                            <TriangleAlert className="size-4 text-destructive shrink-0" />
                          )}
                          {item.name}
                        </span>
                        {overpaying.length > 0 && (
                          <span className="text-xs text-destructive">
                            Acima do teto: {overpaying.join(", ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {CATEGORY_LABELS[item.category]}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {item.payer ? <Badge variant="secondary">{PAYER_LABELS[item.payer]}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.price != null ? formatCurrency(item.price) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {margin ? `${formatCurrency(margin.tax)} (${margin.taxPercent}%)` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCurrency(item.operationalCost)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          available != null && available < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {available != null ? formatCurrency(available) : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          overpaying.length > 0 ? "text-destructive font-medium" : ""
                        }`}
                      >
                        {maxRate > 0 ? (
                          formatCurrency(maxRate)
                        ) : semContrato ? (
                          <span className="text-xs text-amber-600 dark:text-amber-500">sem contrato</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <ServiceItemFormDialog serviceItem={item} groups={groups} />
                          <DeleteButton
                            action={deleteServiceItem.bind(null, item.id)}
                            title={`Excluir "${item.name}"?`}
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
