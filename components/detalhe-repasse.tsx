"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { agruparPorCategoria } from "@/lib/repasse-demonstrativo";

/** Uma linha de repasse já achatada pela tela que a carregou. */
export interface LinhaRepasse {
  serviceItemName: string;
  categoria: string;
  quantity: number;
  rate: number;
}

interface Props {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  titulo: string;
  subtitulo: string;
  linhas: LinhaRepasse[];
  total: number;
  /** Lançamentos que entraram como valor fechado, sem itens. Só aparece no
   * resumo de um período — num dia só, o próprio dia é ou não é detalhado. */
  diasSemDetalhe?: number;
  valorSemDetalhe?: number;
  notas?: string | null;
  /** Quando existe, oferece o documento impresso do mesmo período. */
  hrefDemonstrativo?: string;
  /** Como chamar o que se conta no rodapé: "atendimento" num dia, "unidade"
   * num mês somado. */
  unidade?: string;
}

/** O que compôs um repasse — de um dia ou de um mês inteiro.
 *
 * É um diálogo, e não mais um nível de sanfona, porque as tabelas onde ele é
 * chamado já têm três (mês → dia → lançamento). Um quarto nível começaria a
 * linha do item na metade da tela, e some no celular — que é onde a recepção
 * confere.
 *
 * Serve às três telas que perguntam a mesma coisa: os lançamentos, a ficha
 * do médico e a fila de aprovação. Três diálogos parecidos divergiriam no
 * primeiro ajuste. */
export function DetalheRepasse({
  aberto,
  onOpenChange,
  titulo,
  subtitulo,
  linhas,
  total,
  diasSemDetalhe = 0,
  valorSemDetalhe = 0,
  notas,
  hrefDemonstrativo,
  unidade = "atendimento",
}: Props) {
  const grupos = agruparPorCategoria(
    linhas.map((l) => ({
      quantity: l.quantity,
      rate: l.rate,
      serviceItem: { name: l.serviceItemName, category: l.categoria },
    }))
  );
  const unidades = grupos.reduce((s, g) => s + g.quantidade, 0);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{subtitulo}</DialogDescription>
        </DialogHeader>

        {grupos.length === 0 ? (
          // O caso da base importada: valor digitado direto, como na planilha.
          // Dizer "sem detalhe" é mais honesto do que mostrar uma tabela vazia
          // e deixar a pessoa achar que o sistema perdeu a informação.
          <div className="space-y-2 py-2">
            <Badge variant="outline">Valor fechado</Badge>
            <p className="text-muted-foreground text-sm">
              {diasSemDetalhe > 1
                ? `Os ${diasSemDetalhe} dias deste período entraram com o valor combinado, sem a lista do que foi atendido.`
                : "Este lançamento veio como valor fechado, sem a lista do que foi atendido."}{" "}
              É assim que os dias importados das planilhas chegaram. Para conferir item a item, o dia
              precisa ser lançado com o detalhe.
            </p>
            <p className="pt-1 text-2xl font-semibold tabular-nums">{formatCurrency(total)}</p>
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
                    {grupo.quantidade} · {formatCurrency(grupo.total)}
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

            {/* Nunca somado dentro dos grupos: é a diferença entre "o médico
                atendeu isto" e "alguém digitou este valor". */}
            {diasSemDetalhe > 0 && (
              <p className="text-muted-foreground border-t pt-3 text-xs">
                Mais {diasSemDetalhe} {diasSemDetalhe === 1 ? "dia lançado" : "dias lançados"} como valor
                fechado, sem itens — {formatCurrency(valorSemDetalhe)}. Está somado no total.
              </p>
            )}

            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="text-muted-foreground text-sm tabular-nums">
                {unidades} {unidades === 1 ? unidade : `${unidade}s`}
              </span>
              <span className="text-lg font-semibold tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        {notas && <p className="text-muted-foreground border-t pt-3 text-sm">{notas}</p>}

        {hrefDemonstrativo && (
          <div className="flex justify-end border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={hrefDemonstrativo} target="_blank" rel="noopener" />}
            >
              <FileText className="size-4" />
              Abrir demonstrativo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
