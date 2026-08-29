"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Search, TriangleAlert } from "lucide-react";
import { TableDisclosure } from "@/components/table-disclosure";
import { LocalSortableHead, useLocalSort } from "@/components/sortable-head";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { formatCurrency } from "@/lib/format";
import { sortBy, type Sort, type SortDirection } from "@/lib/sorting";
import { computeMargin, type TaxBracketInput } from "@/lib/service-margin";
import { ServiceItemFormDialog, type ServiceItemFormValues } from "./service-item-form-dialog";
import { categoryLabel, payerLabel } from "@/lib/service-catalog";
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

/** Coluna do catálogo. Texto começa crescente e alinhado à esquerda;
 * dinheiro, decrescente e à direita. */
function Col({
  field,
  sort,
  onSort,
  children,
  align = "right",
}: {
  field: Coluna;
  sort: Sort<Coluna>;
  onSort: (field: Coluna, first: SortDirection) => void;
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <LocalSortableHead
      field={field}
      sort={sort}
      onSort={onSort}
      first={align === "right" ? "desc" : "asc"}
      align={align}
      className={align === "right" ? "text-right" : undefined}
      hint={ORDEM_HINT}
    >
      {children}
    </LocalSortableHead>
  );
}

const SEM_GRUPO = "Sem grupo";

/** Uma linha do catálogo com a economia do item já calculada. */
interface CatalogComputedRow {
  item: CatalogRow;
  margin: ReturnType<typeof computeMargin>;
  /** Quanto sobra para pagar o médico depois de encargos e insumo. `null`
   * quando o item não tem preço de tabela (plantão, auxílio). */
  available: number | null;
  maxRate: number;
  overpaying: string[];
  semContrato: boolean;
}

/** Item sem preço não tem encargo nem sobra apurados — `null` manda a linha
 * para o fim em vez de fingir que vale zero. */
const CHAVES = {
  item: (r: CatalogComputedRow) => r.item.name,
  categoria: (r: CatalogComputedRow) => categoryLabel(r.item.category),
  convenio: (r: CatalogComputedRow) => (r.item.payer ? payerLabel(r.item.payer) : null),
  preco: (r: CatalogComputedRow) => r.item.price,
  encargos: (r: CatalogComputedRow) => r.margin?.tax ?? null,
  insumo: (r: CatalogComputedRow) => r.item.operationalCost,
  sobra: (r: CatalogComputedRow) => r.available,
  repasse: (r: CatalogComputedRow) => (r.maxRate > 0 ? r.maxRate : null),
} satisfies Record<string, (r: CatalogComputedRow) => string | number | null | undefined>;

type Coluna = keyof typeof CHAVES;

/** A ordem vale para os itens dentro de cada grupo. O grupo é o eixo do
 * catálogo — é ele que define o custo de insumo — então ele continua em
 * ordem alfabética, sempre no mesmo lugar. */
const ORDEM_HINT = "os itens de dentro de cada grupo";

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
  const { sort, onSort } = useLocalSort<Coluna>({ field: "item", dir: "asc" });

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
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
      .map(([group, groupRows]) => [group, sortBy(groupRows, CHAVES[sort.field], sort.dir)] as const);
  }, [rows, sort]);

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
            <Col field="item" sort={sort} onSort={onSort} align="left">
              Item
            </Col>
            <Col field="categoria" sort={sort} onSort={onSort} align="left">
              Categoria
            </Col>
            <Col field="convenio" sort={sort} onSort={onSort} align="left">
              Convênio
            </Col>
            <Col field="preco" sort={sort} onSort={onSort}>
              Valor cobrado
            </Col>
            <Col field="encargos" sort={sort} onSort={onSort}>
              Encargos
            </Col>
            <Col field="insumo" sort={sort} onSort={onSort}>
              Custo insumo
            </Col>
            <Col field="sobra" sort={sort} onSort={onSort}>
              Sobra p/ repasse
            </Col>
            <Col field="repasse" sort={sort} onSort={onSort}>
              Maior repasse
            </Col>
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
                    <TableDisclosure open={isOpen} onToggle={() => toggle(group)} label={`o grupo ${group}`}>
                      {group}
                      <span className="text-muted-foreground font-normal text-sm">
                        · {groupRows.length} {groupRows.length === 1 ? "item" : "itens"}
                      </span>
                    </TableDisclosure>
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
                        {categoryLabel(item.category)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {item.payer ? <Badge variant="secondary">{payerLabel(item.payer)}</Badge> : "—"}
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
