"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Pagination } from "@/components/pagination";
import { POR_PAGINA_COMPACTA } from "@/lib/paginacao";
import { aprovarRepasse, reabrirRepasse } from "./payout-actions";

export interface RepassePendente {
  doctorId: string;
  doctorName: string;
  /** "2026-08" */
  mes: string;
  mesLabel: string;
  dias: number;
  total: number;
}

export interface RepasseAprovado {
  id: string;
  doctorName: string;
  mesLabel: string;
  total: number;
  aprovadoPor: string | null;
}

interface Props {
  pendentes: RepassePendente[];
  aprovados: RepasseAprovado[];
  podeAprovar: boolean;
  /** Totais do filtro inteiro — as listas acima já vêm cortadas na
   * página, e contá-las daria sempre no máximo dez. */
  totalPendentes: number;
  totalAprovados: number;
  paginaPendentes: number;
  paginaAprovados: number;
  /** Período e o resto da URL, preservados na troca de página. */
  params: Record<string, string | undefined>;
}

function BotaoConfirmar({
  rotulo,
  titulo,
  descricao,
  acao,
  destrutivo = false,
}: {
  rotulo: string;
  titulo: string;
  descricao: string;
  acao: () => Promise<{ error?: string } | undefined>;
  destrutivo?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const Icone = destrutivo ? RotateCcw : CheckCircle2;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button size="sm" variant={destrutivo ? "ghost" : "outline"} className="h-7" />}
      >
        <Icone className="size-3.5" />
        {rotulo}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await acao();
                if (r?.error) toast.error(r.error);
                else toast.success(destrutivo ? "Repasse reaberto." : "Repasse aprovado.");
              })
            }
          >
            {rotulo}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A fila de aprovação do financeiro.
 *
 * Existe como lista própria, e não como botão no meio da tabela diária,
 * porque quem aprova não está procurando um dia: está perguntando "o que
 * está esperando por mim?". Agrupada por médico e mês, que é a unidade em
 * que o dinheiro sai — um pagamento por médico por mês. */
export function FilaAprovacao({
  pendentes,
  aprovados,
  podeAprovar,
  totalPendentes,
  totalAprovados,
  paginaPendentes,
  paginaAprovados,
  params,
}: Props) {
  if (totalPendentes === 0 && totalAprovados === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aprovação de repasses</CardTitle>
        <CardDescription>
          O lançamento do dia documenta o atendimento. Só depois da aprovação ele vira despesa e entra
          no Dashboard, nos Relatórios e no Balanço.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium">
            Aguardando aprovação {totalPendentes > 0 && `(${totalPendentes})`}
          </p>
          {totalPendentes === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Médico</TableHead>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map((p) => (
                  <TableRow key={`${p.doctorId}-${p.mes}`}>
                    <TableCell className="font-medium">{p.doctorName}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.mesLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.dias}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(p.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {podeAprovar && (
                          <BotaoConfirmar
                            rotulo="Aprovar"
                            titulo={`Aprovar o repasse de ${p.doctorName}?`}
                            descricao={`${formatCurrency(p.total)} entram como despesa em ${p.mesLabel}, somando ${p.dias} dia(s) lançado(s).`}
                            acao={() => aprovarRepasse(p.doctorId, p.mes)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination
            total={totalPendentes}
            page={paginaPendentes}
            pageSize={POR_PAGINA_COMPACTA}
            basePath="/repasses-medicos"
            params={params}
            paramName="pend"
            rotulo="na fila"
          />
        </div>

        {totalAprovados > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Aprovados</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Médico</TableHead>
                  <TableHead>Mês</TableHead>
                  <TableHead>Aprovado por</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {aprovados.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.doctorName}</TableCell>
                    <TableCell className="whitespace-nowrap">{a.mesLabel}</TableCell>
                    <TableCell className="text-muted-foreground">{a.aprovadoPor ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(a.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {podeAprovar && (
                          <BotaoConfirmar
                            rotulo="Reabrir"
                            destrutivo
                            titulo={`Reabrir o repasse de ${a.doctorName}?`}
                            descricao="A despesa sai do resultado e os dias voltam a ficar editáveis. Nenhum lançamento é apagado."
                            acao={() => reabrirRepasse(a.id)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              total={totalAprovados}
              page={paginaAprovados}
              pageSize={POR_PAGINA_COMPACTA}
              basePath="/repasses-medicos"
              params={params}
              paramName="apr"
              rotulo="aprovados"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
