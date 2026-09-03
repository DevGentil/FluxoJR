"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { DetalheRepasse, type LinhaRepasse } from "@/components/detalhe-repasse";

/** Os corpos das duas tabelas da ficha do médico.
 *
 * São client components porque abrem um diálogo, mas só o `<tbody>` vem para
 * cá: o cabeçalho continua no servidor, com os `SortableHead` que ordenam
 * pela URL. Trazer a tabela inteira para o cliente custaria a ordenação e a
 * paginação que já funcionam. */

export interface LancamentoDaFicha {
  id: string;
  date: Date;
  valor: number;
  paid: boolean;
  notes: string | null;
  detalhe: string;
  linhas: LinhaRepasse[];
}

export function CorpoLancamentos({
  doctorId,
  doctorName,
  lancamentos,
}: {
  doctorId: string;
  doctorName: string;
  lancamentos: LancamentoDaFicha[];
}) {
  const [aberto, setAberto] = useState<LancamentoDaFicha | null>(null);

  return (
    <>
      <TableBody>
        {lancamentos.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
              Nenhum lançamento com esse filtro.
            </TableCell>
          </TableRow>
        )}
        {lancamentos.map((l) => (
          <TableRow
            key={l.id}
            className="cursor-pointer hover:bg-muted/30"
            onClick={() => setAberto(l)}
          >
            <TableCell className="tabular-nums">{formatDate(l.date)}</TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {l.detalhe || (
                <Badge variant="outline" className="px-1 py-0 text-[10px]">
                  valor do dia
                </Badge>
              )}
              {l.notes && <span className="block text-[11px]">{l.notes}</span>}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatCurrency(l.valor)}
            </TableCell>
            <TableCell>
              {l.paid ? (
                <Badge variant="secondary">Pago</Badge>
              ) : (
                <span className="text-muted-foreground text-xs">Em aberto</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>

      <DetalheRepasse
        aberto={aberto !== null}
        onOpenChange={(v) => !v && setAberto(null)}
        titulo={doctorName}
        subtitulo={
          aberto ? `${formatDate(aberto.date)} · ${aberto.paid ? "pago" : "em aberto"}` : ""
        }
        linhas={aberto?.linhas ?? []}
        total={aberto?.valor ?? 0}
        diasSemDetalhe={aberto && aberto.linhas.length === 0 ? 1 : 0}
        valorSemDetalhe={aberto && aberto.linhas.length === 0 ? aberto.valor : 0}
        notas={aberto?.notes}
        hrefDemonstrativo={
          aberto ? `/repasse/${doctorId}/${aberto.date.toISOString().slice(0, 7)}` : undefined
        }
      />
    </>
  );
}

export interface MesDaFicha {
  mes: string;
  dias: number;
  total: number;
  media: number;
  linhas: LinhaRepasse[];
  diasSemDetalhe: number;
  valorSemDetalhe: number;
}

export function CorpoMeses({
  doctorId,
  doctorName,
  meses,
}: {
  doctorId: string;
  doctorName: string;
  meses: MesDaFicha[];
}) {
  const [aberto, setAberto] = useState<MesDaFicha | null>(null);

  return (
    <>
      <TableBody>
        {meses.map((m) => (
          <TableRow
            key={m.mes}
            className="cursor-pointer hover:bg-muted/30"
            onClick={() => setAberto(m)}
          >
            <TableCell className="font-medium first-letter:uppercase">{formatMonth(m.mes)}</TableCell>
            <TableCell className="text-right tabular-nums">{m.dias}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatCurrency(m.total)}
            </TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {formatCurrency(m.media)}
            </TableCell>
            {/* O documento impresso continua a um clique da tabela, sem
                passar pelo resumo — quem já sabe o que quer não precisa
                da parada. */}
            <TableCell onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link
                      href={`/repasse/${doctorId}/${m.mes}`}
                      target="_blank"
                      rel="noopener"
                    />
                  }
                >
                  <FileText className="size-4" />
                  Demonstrativo
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>

      <DetalheRepasse
        aberto={aberto !== null}
        onOpenChange={(v) => !v && setAberto(null)}
        titulo={doctorName}
        subtitulo={
          aberto
            ? `${formatMonth(aberto.mes)} · ${aberto.dias} ${
                aberto.dias === 1 ? "dia lançado" : "dias lançados"
              }`
            : ""
        }
        linhas={aberto?.linhas ?? []}
        total={aberto?.total ?? 0}
        diasSemDetalhe={aberto?.diasSemDetalhe ?? 0}
        valorSemDetalhe={aberto?.valorSemDetalhe ?? 0}
        hrefDemonstrativo={aberto ? `/repasse/${doctorId}/${aberto.mes}` : undefined}
      />
    </>
  );
}
