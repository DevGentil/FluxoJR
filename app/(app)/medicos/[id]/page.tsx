import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds } from "@/lib/scope";
import { formatBytes, formatCurrency, formatDate, formatMonth, formatPercent } from "@/lib/format";
import { categoryLabel, payerLabel } from "@/lib/service-catalog";
import { parseDateOnly, todayDateOnly, toMonthKey } from "@/lib/date-only";
import { contractOn, previousVersions, scheduledVersions } from "@/lib/doctor-rates";
import { entryAmount } from "@/lib/doctor-period";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/kpi-card";
import {
  ArrowLeft,
  CalendarCheck,
  CircleCheck,
  CircleDashed,
  Download,
  FileText,
  History,
  Wallet,
} from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Pagination } from "@/components/pagination";
import { SortableHead } from "@/components/sortable-head";
import { parseSort, sortBy } from "@/lib/sorting";
import { DoctorDocumentDialog } from "../doctor-document-dialog";
import { DoctorEntriesFilter } from "../doctor-entries-filter";
import { deleteDoctorDocument } from "../documents-actions";


const hoje = parseDateOnly(todayDateOnly());

/** Ficha completa de um médico: quem é, o que foi combinado (com o histórico
 * de reajustes) e tudo que já foi lançado para ele.
 *
 * Nasceu quando a base real trouxe 81 médicos: a lista única deixou de
 * responder "quanto esse médico custou e desde quando o valor é esse". */
const LANC_POR_PAGINA = 25;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    mes?: string;
    pago?: string;
    /** Ordem da tabela de lançamentos. */
    sort?: string;
    dir?: string;
    /** Ordem da tabela de repasse por mês — parâmetros próprios para as
     * duas tabelas desta tela não disputarem o mesmo nome. */
    msort?: string;
    mdir?: string;
  }>;
}

const COLUNAS_LANC = ["dia", "valor", "pago"] as const;
const COLUNAS_MES = ["mes", "dias", "total", "media"] as const;

export default async function MedicoPage({ params, searchParams }: Props) {
  const { id } = await params;
  const filtros = await searchParams;
  const page = Math.max(1, Number(filtros.page) || 1);

  // O escopo ativo continua mandando: uma unidade não abre a ficha de um
  // médico de outra, nem pelo endereço direto.
  const scope = await getActiveScope();
  const companyIds = await resolveCompanyIds(scope);

  const doctor = await prisma.doctor.findFirst({
    where: { id, companyId: { in: companyIds } },
    include: {
      company: { select: { name: true } },
      serviceRates: { include: { serviceItem: { select: { name: true, category: true, payer: true } } } },
      dailyEntries: {
        include: { lines: { include: { serviceItem: { select: { name: true } } } } },
        orderBy: { date: "desc" },
      },
      documents: {
        select: { id: true, fileName: true, description: true, size: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!doctor) notFound();

  const vigentes = contractOn(doctor.serviceRates, hoje).sort((a, b) =>
    a.serviceItem.name.localeCompare(b.serviceItem.name)
  );
  const agendados = scheduledVersions(doctor.serviceRates, hoje);

  const lancamentos = doctor.dailyEntries.map((e) => ({
    id: e.id,
    date: e.date,
    paid: e.paid,
    notes: e.notes,
    valor: entryAmount(e),
    detalhe: e.lines.map((l) => `${Number(l.quantity)}× ${l.serviceItem.name}`).join(", "),
  }));

  const total = lancamentos.reduce((s, l) => s + l.valor, 0);
  const pago = lancamentos.filter((l) => l.paid).reduce((s, l) => s + l.valor, 0);

  // Mês a mês, do mais recente para o mais antigo — é como o repasse é
  // conferido e fechado.
  const porMes = new Map<string, { dias: number; total: number }>();
  for (const l of lancamentos) {
    const k = toMonthKey(l.date);
    const atual = porMes.get(k) ?? { dias: 0, total: 0 };
    porMes.set(k, { dias: atual.dias + 1, total: atual.total + l.valor });
  }
  const mesesBrutos = [...porMes.entries()].map(([mes, v]) => ({
    mes,
    dias: v.dias,
    total: v.total,
    media: v.total / v.dias,
  }));
  const ordemMes = parseSort(
    { sort: filtros.msort, dir: filtros.mdir },
    COLUNAS_MES,
    { field: "mes", dir: "desc" }
  );
  const meses = sortBy(mesesBrutos, (m) => m[ordemMes.field], ordemMes.dir);

  // Filtro dos lançamentos: mês e situação de pagamento. Fica na URL para
  // compor com a paginação e sobreviver ao recarregar.
  const filtrados = lancamentos.filter((l) => {
    if (filtros.mes && toMonthKey(l.date) !== filtros.mes) return false;
    if (filtros.pago === "sim" && !l.paid) return false;
    if (filtros.pago === "nao" && l.paid) return false;
    return true;
  });
  // Ordena o filtro inteiro antes de cortar a página, não a página aberta.
  const ordemLanc = parseSort(filtros, COLUNAS_LANC, { field: "dia", dir: "desc" });
  const chaveLanc = {
    dia: (l: (typeof filtrados)[number]) => l.date,
    valor: (l: (typeof filtrados)[number]) => l.valor,
    pago: (l: (typeof filtrados)[number]) => Number(l.paid),
  } as const;
  const ordenados = sortBy(filtrados, chaveLanc[ordemLanc.field], ordemLanc.dir);

  const visiveis = ordenados.slice((page - 1) * LANC_POR_PAGINA, page * LANC_POR_PAGINA);
  const totalFiltrado = filtrados.reduce((s, l) => s + l.valor, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/medicos" />}>
          <ArrowLeft className="size-4" />
          Todos os médicos
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{doctor.name}</h1>
          <Badge variant={doctor.active ? "secondary" : "outline"}>
            {doctor.active ? "Ativo" : "Inativo"}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {doctor.specialty} · {doctor.company.name}
          {doctor.document && ` · ${doctor.document}`}
          {doctor.paymentMethod && ` · ${doctor.paymentMethod}`}
        </p>
        {doctor.notes && <p className="text-muted-foreground text-sm italic">{doctor.notes}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total lançado" value={formatCurrency(total)} icon={Wallet} iconClass="text-amber-500" />
        <KpiCard
          label="Já pago"
          value={formatCurrency(pago)}
          hint={total > 0 ? `${formatPercent(pago, total, 0)} do total` : undefined}
          icon={CircleCheck}
          iconClass="text-emerald-500"
        />
        <KpiCard
          label="A pagar"
          value={formatCurrency(total - pago)}
          icon={CircleDashed}
          iconClass={total - pago > 0 ? "text-destructive" : "text-muted-foreground"}
        />
        <KpiCard
          label="Dias lançados"
          value={String(lancamentos.length)}
          hint={meses.length > 0 ? `em ${meses.length} mês(es)` : undefined}
          icon={CalendarCheck}
          iconClass="text-sky-500"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contrato</CardTitle>
          <CardDescription>
            O valor combinado por item. Um reajuste cria uma versão nova — a anterior fica no histórico e
            continua valendo para os dias já lançados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Convênio</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vigente desde</TableHead>
                <TableHead>Histórico</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vigentes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum valor combinado. Sem contrato, só dá para lançar o valor total do dia.
                  </TableCell>
                </TableRow>
              )}
              {vigentes.map((r) => {
                const doItem = doctor.serviceRates.filter((v) => v.serviceItemId === r.serviceItemId);
                const anteriores = previousVersions(doItem, hoje);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.serviceItem.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {categoryLabel(r.serviceItem.category)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {r.serviceItem.payer ? (
                        <Badge variant="secondary">{payerLabel(r.serviceItem.payer)}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(Number(r.rate))}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm tabular-nums">
                      {formatDate(r.validFrom)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {anteriores.length === 0
                        ? "—"
                        : anteriores
                            .map((v) => `${formatCurrency(Number(v.rate))} até ${formatDate(r.validFrom)}`)
                            .join(" · ")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {agendados.length > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-500 mt-3">
              <History className="size-4 shrink-0" />
              {agendados.length} reajuste(s) já cadastrado(s) para entrar em vigor mais para frente.
            </p>
          )}
        </CardContent>
      </Card>

      {meses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Repasse por mês</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead field="mes" first="desc" prefix="m" current={ordemMes}>
                    Mês
                  </SortableHead>
                  <SortableHead
                    field="dias"
                    first="desc"
                    prefix="m"
                    align="right"
                    className="text-right"
                    current={ordemMes}
                  >
                    Dias
                  </SortableHead>
                  <SortableHead
                    field="total"
                    first="desc"
                    prefix="m"
                    align="right"
                    className="text-right"
                    current={ordemMes}
                  >
                    Total
                  </SortableHead>
                  <SortableHead
                    field="media"
                    first="desc"
                    prefix="m"
                    align="right"
                    className="text-right"
                    current={ordemMes}
                  >
                    Média por dia
                  </SortableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {meses.map((m) => (
                  <TableRow key={m.mes}>
                    <TableCell className="font-medium first-letter:uppercase">
                      {formatMonth(m.mes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.dias}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(m.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(m.media)}
                    </TableCell>
                    <TableCell>
                      {/* O demonstrativo abre em aba nova de propósito: ele é
                          para imprimir ou salvar, e quem faz isso costuma
                          voltar à ficha para o próximo mês. */}
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          nativeButton={false}
                          render={
                            <Link
                              href={`/repasse/${doctor.id}/${m.mes}`}
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
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Arquivos</CardTitle>
            <CardDescription>
              Contrato assinado, aditivos, documentos do médico — guardados junto da ficha.
            </CardDescription>
          </div>
          <DoctorDocumentDialog doctorId={doctor.id} doctorName={doctor.name} />
        </CardHeader>
        <CardContent>
          {doctor.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum arquivo anexado. O contrato assinado é o candidato natural.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Tamanho</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {doctor.documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.fileName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{d.description}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground text-sm">
                      {formatBytes(d.size)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm tabular-nums">
                      {formatDate(d.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          nativeButton={false}
                          render={<a href={`/api/documents/${d.id}`} />}
                          aria-label={`Baixar ${d.fileName}`}
                        >
                          <Download className="size-4" />
                        </Button>
                        <DeleteButton
                          action={deleteDoctorDocument.bind(null, d.id)}
                          title={`Excluir "${d.fileName}"?`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {filtrados.length} lançamento(s)
            {filtrados.length !== lancamentos.length && (
              <span className="text-muted-foreground font-normal text-sm"> de {lancamentos.length}</span>
            )}
            <span className="text-muted-foreground font-normal text-sm">
              {" "}
              · {formatCurrency(totalFiltrado)}
            </span>
          </CardTitle>
          <CardDescription>Para lançar ou editar um dia, use a tela de Repasses Médicos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* As opções do filtro saem da lista bruta, sempre do mês mais
              recente para o mais antigo — ordenar a tabela por valor não
              deve embaralhar o seletor de mês. */}
          <DoctorEntriesFilter
            doctorId={doctor.id}
            meses={sortBy(mesesBrutos, (m) => m.mes, "desc").map((m) => m.mes)}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead field="dia" first="desc" current={ordemLanc}>
                  Dia
                </SortableHead>
                <TableHead>Detalhe</TableHead>
                <SortableHead field="valor" first="desc" align="right" className="text-right" current={ordemLanc}>
                  Valor
                </SortableHead>
                <SortableHead field="pago" current={ordemLanc}>
                  Pago
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {lancamentos.length === 0
                      ? "Nenhum dia lançado para esse médico ainda."
                      : "Nenhum lançamento para esse filtro."}
                  </TableCell>
                </TableRow>
              )}
              {visiveis.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="tabular-nums">{formatDate(l.date)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {l.detalhe || (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        valor do dia
                      </Badge>
                    )}
                    {l.notes && <span className="block text-[11px]">{l.notes}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
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
          </Table>
          <Pagination
            total={filtrados.length}
            page={page}
            pageSize={LANC_POR_PAGINA}
            basePath={`/medicos/${doctor.id}`}
            params={filtros}
          />
        </CardContent>
      </Card>
    </div>
  );
}
