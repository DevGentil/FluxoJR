"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatWeekday } from "@/lib/format";
import { agruparPorCategoria } from "@/lib/repasse-demonstrativo";
import type { DailyEntryRow } from "./daily-entries-table";

interface Props {
  lancamento: DailyEntryRow | null;
  onOpenChange: (aberto: boolean) => void;
}

/** O que compôs um dia de repasse: quantas consultas, quantos exames, a que
 * valor combinado.
 *
 * É um diálogo, e não mais um nível de sanfona na tabela, porque a tabela já
 * tem três (mês → dia → lançamento). Um quarto nível de indentação deixaria
 * a linha do item começando na metade da tela — e some no celular, que é
 * onde a recepção confere. */
export function DetalheLancamento({ lancamento, onOpenChange }: Props) {
  const grupos = lancamento ? agruparPorCategoria(lancamento.lines.map(paraLinhaCrua)) : [];
  const totalUnidades = grupos.reduce((s, g) => s + g.quantidade, 0);

  return (
    <Dialog open={lancamento !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {lancamento && (
          <>
            <DialogHeader>
              <DialogTitle>{lancamento.doctorName}</DialogTitle>
              <DialogDescription>
                {formatDate(lancamento.date)} · {formatWeekday(lancamento.date)}
                {lancamento.paid ? " · pago" : " · em aberto"}
              </DialogDescription>
            </DialogHeader>

            {grupos.length === 0 ? (
              // O caso da base importada: valor digitado direto, como na
              // planilha. Dizer "sem detalhe" é mais honesto do que mostrar
              // uma tabela vazia e deixar a pessoa achar que o sistema perdeu
              // a informação.
              <div className="space-y-2 py-2">
                <Badge variant="outline">Valor do dia</Badge>
                <p className="text-muted-foreground text-sm">
                  Este lançamento veio como valor fechado, sem a lista do que foi atendido — é assim que
                  os dias importados das planilhas chegaram. Para conferir item a item, o dia precisa ser
                  lançado com o detalhe.
                </p>
                <p className="pt-1 text-2xl font-semibold tabular-nums">
                  {formatCurrency(lancamento.value)}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {grupos.map((grupo) => (
                  <div key={grupo.categoria}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                        {grupo.rotulo}
                      </p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {grupo.quantidade} {grupo.quantidade === 1 ? "unidade" : "unidades"} ·{" "}
                        {formatCurrency(grupo.total)}
                      </p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qtd.</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grupo.itens.map((item) => (
                          <TableRow key={`${item.item}-${item.taxa}`}>
                            <TableCell className="font-medium">{item.item}</TableCell>
                            <TableCell className="text-right tabular-nums">{item.quantidade}</TableCell>
                            <TableCell className="text-muted-foreground text-right tabular-nums">
                              {formatCurrency(item.taxa)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(item.subtotal)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}

                <div className="flex items-baseline justify-between border-t pt-3">
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {totalUnidades} {totalUnidades === 1 ? "atendimento" : "atendimentos"} no dia
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {formatCurrency(lancamento.value)}
                  </span>
                </div>
              </div>
            )}

            {lancamento.notes && (
              <p className="text-muted-foreground border-t pt-3 text-sm">{lancamento.notes}</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A linha da tela já vem achatada (sem o item do catálogo aninhado); isto a
 * devolve ao formato que o agrupamento espera. */
function paraLinhaCrua(l: DailyEntryRow["lines"][number]) {
  return {
    quantity: l.quantity,
    rate: l.rate,
    serviceItem: { name: l.serviceItemName, category: l.categoria },
  };
}
