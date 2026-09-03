"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Search, Trash2 } from "lucide-react";
import { TableDisclosure } from "@/components/table-disclosure";
import { FechamentoMes } from "./fechamento-mes";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate, formatMonth, formatWeekday } from "@/lib/format";
import { DailyEntryFormDialog, type DoctorOption } from "./daily-entry-form-dialog";
import { DetalheLancamento } from "./detalhe-lancamento";
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
  lines: {
    id: string;
    serviceItemId: string;
    serviceItemName: string;
    /** Categoria do item no catálogo — é ela que separa consulta de exame no
     * detalhe do dia. */
    categoria: string;
    quantity: number;
    rate: number;
  }[];
}

interface Props {
  entries: DailyEntryRow[];
  doctors: DoctorOption[];
  /** Chaves "2026-08" dos meses já fechados nesta unidade. */
  mesesFechados: string[];
  /** Se a sessão pode fechar mês (nível "aprovar" em Lançamentos). */
  podeFechar: boolean;
  /** Se a sessão pode reabrir — gestor da unidade ou holding. */
  podeReabrir: boolean;
}

/** Quantos dias por página dentro de um mês aberto. Um mês cheio da unidade
 * real passa de 30 dias com mais de 20 lançamentos cada. */
const DIAS_POR_PAGINA = 15;

interface Grupo<T> {
  key: string;
  rows: DailyEntryRow[];
  total: number;
  pagos: number;
  medicos: number;
  extra: T;
}

function resumir<T>(key: string, rows: DailyEntryRow[], extra: T): Grupo<T> {
  return {
    key,
    rows,
    extra,
    total: rows.reduce((s, r) => s + r.value, 0),
    pagos: rows.filter((r) => r.paid).length,
    medicos: new Set(rows.map((r) => r.doctorId)).size,
  };
}

/** Lançamentos em três níveis: mês → dia → os lançamentos daquele dia.
 *
 * A base real tem 2.483 dias lançados. Abrir um mês inteiro de uma vez
 * despejava centenas de linhas seguidas, sem nenhuma pista de onde um dia
 * termina e o outro começa — que é justamente como as planilhas organizam.
 * Agora o mês mostra a lista de dias com o total de cada um, e só o dia que
 * se abre mostra quem atendeu. */
export function DailyEntriesTable({
  entries,
  doctors,
  mesesFechados,
  podeFechar,
  podeReabrir,
}: Props) {
  const fechados = new Set(mesesFechados);
  const [search, setSearch] = useState("");
  // Todos os meses começam fechados. A linha de cada mês já traz médicos,
  // lançamentos, total e quantos foram pagos — quem quer o detalhe abre.
  const [mesAberto, setMesAberto] = useState<string | null>(null);
  const [diasAbertos, setDiasAbertos] = useState<Set<string>>(new Set());
  const [pagina, setPagina] = useState(1);

  // Um diálogo de edição e um de exclusão para a tabela inteira, abertos com
  // a linha escolhida — montar um par por linha punha centenas de
  // componentes na árvore, cada um segurando a lista de médicos.
  const [editando, setEditando] = useState<DailyEntryRow | null>(null);
  const [detalhando, setDetalhando] = useState<DailyEntryRow | null>(null);
  const [excluindo, setExcluindo] = useState<DailyEntryRow | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function abrirMes(key: string) {
    setMesAberto((atual) => (atual === key ? null : key));
    setDiasAbertos(new Set());
    setPagina(1);
  }

  function abrirDia(key: string) {
    setDiasAbertos((prev) => {
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

  const meses = useMemo(() => {
    const map = new Map<string, DailyEntryRow[]>();
    for (const e of filtered) {
      const key = e.date.toISOString().slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => resumir(key, rows, null));
  }, [filtered]);

  /** Os dias do mês aberto, do mais recente para o mais antigo. */
  const diasDoMes = useMemo(() => {
    const mes = meses.find((m) => m.key === mesAberto);
    if (!mes) return [];
    const map = new Map<string, DailyEntryRow[]>();
    for (const e of mes.rows) {
      const key = e.date.toISOString().slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => resumir(key, rows, rows[0].date));
  }, [meses, mesAberto]);

  const totalPaginas = Math.max(1, Math.ceil(diasDoMes.length / DIAS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const diasVisiveis = diasDoMes.slice(
    (paginaAtual - 1) * DIAS_POR_PAGINA,
    paginaAtual * DIAS_POR_PAGINA
  );

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPagina(1);
          }}
          placeholder="Buscar por médico..."
          className="pl-8"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mês / Dia</TableHead>
            <TableHead>Médico</TableHead>
            <TableHead className="hidden md:table-cell">Detalhe</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="w-20">Pago</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {meses.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {isSearching ? "Nenhum lançamento para essa busca." : "Nenhum dia lançado ainda."}
              </TableCell>
            </TableRow>
          )}

          {meses.map((mes) => {
            const mesAbertoAgora = mes.key === mesAberto;
            return (
              <Fragment key={mes.key}>
                <TableRow
                  className="cursor-pointer bg-muted/40 hover:bg-muted/60"
                  onClick={() => abrirMes(mes.key)}
                >
                  <TableCell className="font-semibold">
                    <TableDisclosure
                      open={mesAbertoAgora}
                      onToggle={() => abrirMes(mes.key)}
                      label={formatMonth(mes.key)}
                    >
                      {/* Só a primeira letra: `capitalize` produzia "Agosto
                          De 2026", que não é português. */}
                      <span className="first-letter:uppercase">{formatMonth(mes.key)}</span>
                    </TableDisclosure>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{mes.medicos} médico(s)</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {mes.rows.length} lançamento(s)
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatCurrency(mes.total)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {mes.pagos}/{mes.rows.length}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <FechamentoMes
                        mes={mes.key}
                        fechado={fechados.has(mes.key)}
                        podeFechar={podeFechar}
                        podeReabrir={podeReabrir}
                        lancamentos={mes.rows.length}
                      />
                    </div>
                  </TableCell>
                </TableRow>

                {mesAbertoAgora &&
                  diasVisiveis.map((dia) => {
                    const diaAberto = isSearching || diasAbertos.has(dia.key);
                    return (
                      <Fragment key={dia.key}>
                        <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => abrirDia(dia.key)}>
                          <TableCell className="pl-6">
                            <TableDisclosure
                              open={diaAberto}
                              onToggle={() => abrirDia(dia.key)}
                              label={`os lançamentos de ${formatDate(dia.extra)}`}
                            >
                              <span className="tabular-nums">{formatDate(dia.extra)}</span>
                              <span className="text-muted-foreground text-xs">{formatWeekday(dia.extra)}</span>
                            </TableDisclosure>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {dia.medicos} médico(s)
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                            {dia.rows.length} lançamento(s)
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatCurrency(dia.total)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {dia.pagos}/{dia.rows.length}
                          </TableCell>
                          <TableCell />
                        </TableRow>

                        {diaAberto &&
                          dia.rows.map((r) => (
                            <TableRow
                              key={r.id}
                              // A linha inteira abre o detalhe do dia. O nome do
                              // médico continua levando à ficha dele — dois
                              // destinos diferentes na mesma linha, e por isso o
                              // link para de propagar o clique.
                              className="cursor-pointer hover:bg-muted/30"
                              onClick={() => setDetalhando(r)}
                            >
                              <TableCell />
                              <TableCell className="pl-10">
                                <Link
                                  href={`/medicos/${r.doctorId}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="hover:underline underline-offset-2"
                                >
                                  {r.doctorName}
                                </Link>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                                {r.lines.length > 0 ? (
                                  r.lines.map((l) => `${l.quantity}× ${l.serviceItemName}`).join(", ")
                                ) : (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    valor do dia
                                  </Badge>
                                )}
                                {r.notes && <span className="block text-[11px]">{r.notes}</span>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(r.value)}</TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <PaidToggle entryId={r.id} paid={r.paid} />
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditando(r)}
                                    aria-label={`Editar o lançamento de ${r.doctorName} em ${formatDate(r.date)}`}
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setExcluindo(r)}
                                    aria-label={`Excluir o lançamento de ${r.doctorName} em ${formatDate(r.date)}`}
                                  >
                                    <Trash2 className="size-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}

                {mesAbertoAgora && totalPaginas > 1 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6}>
                      <div className="flex items-center justify-between gap-4 py-1">
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {(paginaAtual - 1) * DIAS_POR_PAGINA + 1}–
                          {Math.min(paginaAtual * DIAS_POR_PAGINA, diasDoMes.length)} de {diasDoMes.length} dias
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={paginaAtual <= 1}
                            onClick={() => setPagina(paginaAtual - 1)}
                          >
                            Anterior
                          </Button>
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {paginaAtual} / {totalPaginas}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={paginaAtual >= totalPaginas}
                            onClick={() => setPagina(paginaAtual + 1)}
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      {/* A `key` força o formulário a remontar ao trocar de linha — sem ela o
          diálogo reaproveitado ficaria com os valores do lançamento anterior,
          porque o estado inicial só é lido na montagem. */}
      {editando && (
        <DailyEntryFormDialog
          key={editando.id}
          doctors={doctors}
          entry={editando}
          open
          onOpenChange={(v) => !v && setEditando(null)}
        />
      )}

      <DetalheLancamento lancamento={detalhando} onOpenChange={(v) => !v && setDetalhando(null)} />

      <AlertDialog open={excluindo != null} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {excluindo
                ? `Excluir o lançamento de ${excluindo.doctorName} em ${formatDate(excluindo.date)}?`
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => {
                const alvo = excluindo;
                if (!alvo) return;
                startDelete(async () => {
                  const result = await deleteDailyEntry(alvo.id);
                  if (result.error) toast.error(result.error);
                  setExcluindo(null);
                });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
