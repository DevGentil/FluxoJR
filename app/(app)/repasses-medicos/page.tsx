import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { accessFor } from "@/lib/access";
import { can } from "@/lib/permissions";
import { mesesFechados, podeReabrir } from "@/lib/period-lock";
import { formatCurrency } from "@/lib/format";
import { entryAmount } from "@/lib/doctor-period";
import { toDateOnly } from "@/lib/date-only";
import { dateFilter, monthPresets, parseMonthRange, type MonthRange } from "@/lib/month-range";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { MonthRangeFilter } from "@/components/month-range-filter";
import { KpiCard } from "@/components/kpi-card";
import { DailyEntryFormDialog } from "./daily-entry-form-dialog";
import { DailyEntriesTable, type DailyEntryRow } from "./daily-entries-table";
import { FilaAprovacao, type RepassePendente, type RepasseAprovado } from "./fila-aprovacao";
import { Wallet, CalendarCheck, CircleCheck, CircleDashed } from "lucide-react";

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

/** Custo do período separado entre o que já saiu do caixa e o que ainda
 * está em aberto — a pergunta que essa tela responde. */
function paymentTotals(entries: { value: number; paid: boolean }[]) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  const pago = entries.filter((e) => e.paid).reduce((s, e) => s + e.value, 0);
  return { total, pago, aPagar: total - pago, pagos: entries.filter((e) => e.paid).length };
}

function PaymentKpis({ entries }: { entries: { value: number; paid: boolean }[] }) {
  const { total, pago, aPagar, pagos } = paymentTotals(entries);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Custo de repasses"
        value={formatCurrency(total)}
        icon={Wallet}
        iconClass="text-amber-500"
      />
      <KpiCard
        label="Já pago"
        value={formatCurrency(pago)}
        hint={total > 0 ? `${((pago / total) * 100).toFixed(0)}% do período` : undefined}
        icon={CircleCheck}
        iconClass="text-emerald-500"
      />
      <KpiCard
        label="A pagar"
        value={formatCurrency(aPagar)}
        hint={aPagar > 0 ? `${entries.length - pagos} dia(s) em aberto` : "Nada em aberto"}
        icon={CircleDashed}
        iconClass={aPagar > 0 ? "text-destructive" : "text-muted-foreground"}
      />
      <KpiCard
        label="Dias lançados"
        value={String(entries.length)}
        hint={`${pagos} pago(s)`}
        icon={CalendarCheck}
        iconClass="text-sky-500"
      />
    </div>
  );
}

async function ConsolidatedSummary({
  companyIds,
  scopeLabel,
  range,
}: {
  companyIds: string[];
  scopeLabel: string;
  range: MonthRange | null;
}) {
  const dateWhere = dateFilter(range);

  const [companies, entries] = await Promise.all([
    companyIds.length === 0
      ? []
      : prisma.company.findMany({ where: { id: { in: companyIds } }, orderBy: { name: "asc" } }),
    prisma.doctorDailyEntry.findMany({
      where: { companyId: { in: companyIds }, ...(dateWhere ? { date: dateWhere } : {}) },
      select: { companyId: true, amount: true, paid: true, lines: { select: { quantity: true, rate: true } } },
    }),
  ]);

  const rows = entries.map((e) => ({ companyId: e.companyId, value: entryAmount(e), paid: e.paid }));

  const byCompany = new Map<string, { id: string; name: string; dias: number; total: number; pago: number }>();
  for (const c of companies) {
    byCompany.set(c.id, { id: c.id, name: c.name, dias: 0, total: 0, pago: 0 });
  }
  for (const r of rows) {
    const entry = byCompany.get(r.companyId);
    if (!entry) continue;
    entry.dias += 1;
    entry.total += r.value;
    if (r.paid) entry.pago += r.value;
  }
  const summaries = Array.from(byCompany.values());
  const grandTotal = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Repasses Médicos</h1>
        <p className="text-muted-foreground text-sm">
          Quanto cada unidade paga aos médicos — {scopeLabel}. Para lançar um dia, use &quot;Ver
          detalhes&quot;. Preço, margem e catálogo ficam em Operação.
        </p>
      </div>

      <MonthRangeFilter presets={monthPresets()} range={range} />

      <PaymentKpis entries={rows} />

      <Card>
        <CardHeader>
          <CardTitle>{summaries.length} unidade(s)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Dias lançados</TableHead>
                <TableHead className="text-right">Custo de repasse</TableHead>
                <TableHead className="text-right">Já pago</TableHead>
                <TableHead className="text-right">A pagar</TableHead>
                <TableHead className="text-right">% do grupo</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma empresa nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {summaries.map((s) => {
                const aPagar = s.total - s.pago;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.dias}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.pago)}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${aPagar > 0 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {formatCurrency(aPagar)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {grandTotal > 0 ? `${((s.total / grandTotal) * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <SwitchToCompanyButton companyId={s.id} label="Ver detalhes" />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function RepassesMedicosPage({ searchParams }: Props) {
  const range = parseMonthRange(await searchParams);

  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedSummary companyIds={companyIds} scopeLabel={scopeLabel} range={range} />;
  }

  const companyId = scope.companyId;
  const dateWhere = dateFilter(range);

  // Quem pode fechar e reabrir, e o que já está fechado. Numa consulta só —
  // sem isso, doze meses na tela fariam doze perguntas ao banco só para
  // desenhar doze cadeados.
  const [acesso, fechados, reabrir] = await Promise.all([
    accessFor(companyId),
    mesesFechados([companyId]),
    podeReabrir(companyId),
  ]);

  const [doctors, entries] = await Promise.all([
    prisma.doctor.findMany({
      where: { companyId },
      include: { serviceRates: { include: { serviceItem: { select: { name: true, payer: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.doctorDailyEntry.findMany({
      where: { companyId, ...(dateWhere ? { date: dateWhere } : {}) },
      include: { doctor: { select: { name: true } }, lines: { include: { serviceItem: { select: { name: true } } } } },
      orderBy: [{ date: "desc" }, { doctor: { name: "asc" } }],
    }),
  ]);

  // O contrato vai junto para o diálogo mostrar os valores combinados na
  // hora de lançar — é o que a planilha deixa à vista ao lado dos dias.
  //
  // Vão TODAS as versões, não só a vigente hoje: o diálogo precisa mostrar
  // o valor que valia na data escolhida, que é o mesmo que o servidor vai
  // congelar. Mandar só o de hoje faria a tela somar um total e o banco
  // gravar outro ao lançar um dia anterior a um reajuste.
  const doctorOptions = doctors.map((d) => ({
    id: d.id,
    name: d.name,
    serviceRates: d.serviceRates.map((r) => ({
      serviceItemId: r.serviceItemId,
      serviceItemName: r.serviceItem.name,
      rate: Number(r.rate),
      payer: r.serviceItem.payer,
      validFrom: toDateOnly(r.validFrom),
    })),
  }));

  // Cada dia lançado, com o valor que a planilha traz na coluna "Valor":
  // o digitado direto ou a soma das linhas pela taxa congelada.
  const entryRows: DailyEntryRow[] = entries.map((e) => ({
    id: e.id,
    date: e.date,
    doctorId: e.doctorId,
    doctorName: e.doctor.name,
    amount: e.amount != null ? Number(e.amount) : null,
    paid: e.paid,
    notes: e.notes,
    value: entryAmount(e),
    lines: e.lines.map((l) => ({
      id: l.id,
      serviceItemId: l.serviceItemId,
      serviceItemName: l.serviceItem.name,
      quantity: Number(l.quantity),
      rate: Number(l.rate),
    })),
  }));

  // A fila do financeiro: o que ainda não virou despesa, agrupado por
  // médico e mês — que é a unidade em que o dinheiro sai.
  const pendentesPorChave = new Map<string, RepassePendente>();
  for (const e of entries) {
    if (e.payoutId) continue;
    const mes = e.date.toISOString().slice(0, 7);
    const chave = e.doctorId + "|" + mes;
    const atual = pendentesPorChave.get(chave);
    const valor = entryAmount(e);
    if (atual) {
      atual.dias += 1;
      atual.total += valor;
      continue;
    }
    const [ano, m] = mes.split("-");
    pendentesPorChave.set(chave, {
      doctorId: e.doctorId,
      doctorName: e.doctor.name,
      mes,
      mesLabel: m + "/" + ano,
      dias: 1,
      total: valor,
    });
  }
  const pendentes = [...pendentesPorChave.values()].sort(
    (a, b) => a.mes.localeCompare(b.mes) || a.doctorName.localeCompare(b.doctorName, "pt-BR")
  );

  const payouts = await prisma.doctorPayout.findMany({
    where: { companyId: scope.companyId },
    include: { doctor: { select: { name: true } } },
    orderBy: [{ month: "desc" }, { approvedAt: "desc" }],
    take: 50,
  });
  const aprovados: RepasseAprovado[] = payouts.map((p) => {
    const [ano, m] = p.month.toISOString().slice(0, 7).split("-");
    return {
      id: p.id,
      doctorName: p.doctor.name,
      mesLabel: m + "/" + ano,
      total: Number(p.amount),
      aprovadoPor: p.approvedByName,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Repasses Médicos</h1>
        <p className="text-muted-foreground text-sm">
          Um lançamento por dia de atendimento, como nas planilhas. Contratos ficam em Médicos; preço, taxa e
          margem, em Operação.
        </p>
      </div>

      <MonthRangeFilter presets={monthPresets()} range={range} />

      <PaymentKpis entries={entryRows} />

      <FilaAprovacao
        pendentes={pendentes}
        aprovados={aprovados}
        podeAprovar={can(acesso, "repasses-medicos", "aprovar")}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Lançamentos</CardTitle>
            <CardDescription>
              Abra o mês para ver os dias, e o dia para ver os lançamentos dele.
            </CardDescription>
          </div>
          <DailyEntryFormDialog doctors={doctorOptions} />
        </CardHeader>
        <CardContent>
          <DailyEntriesTable
            entries={entryRows}
            doctors={doctorOptions}
            mesesFechados={[...fechados]}
            podeFechar={can(acesso, "repasses-medicos", "aprovar")}
            podeReabrir={reabrir}
          />
        </CardContent>
      </Card>
    </div>
  );
}
