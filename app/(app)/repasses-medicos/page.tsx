import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/delete-button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { DoctorFormDialog } from "./doctor-form-dialog";
import { ServiceItemFormDialog } from "./service-item-form-dialog";
import { ServiceCatalogTable } from "./service-catalog-table";
import { TaxBracketFormDialog } from "./tax-bracket-form-dialog";
import { deleteTaxBracket } from "./tax-brackets-actions";
import { DailyEntryFormDialog } from "./daily-entry-form-dialog";
import { DailyEntriesTable, type DailyEntryRow } from "./daily-entries-table";
import { MetricsTable, type MetricRow } from "./metrics-table";
import { MonthRangeFilter } from "./month-range-filter";
import { CostCompositionChart, ConversionChart } from "./metrics-charts";
import { summarizeDailyEntries, entryAmount } from "@/lib/doctor-period";
import { deleteDoctor } from "./doctors-actions";
import { CheckContractButton } from "./check-contract-button";
import { Wallet, Activity, Percent, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** O filtro continua sendo por mês ("De"/"Até" no formato "YYYY-MM"), mas os
 * lançamentos são diários — então vira um intervalo fechado no primeiro dia
 * de "de" e aberto no primeiro dia do mês seguinte a "até". */
function dateFilter(range: { from: string; to: string } | null) {
  if (!range) return undefined;
  const [toYear, toMonth] = range.to.split("-").map(Number);
  if (!toYear || !toMonth) return undefined;
  return { gte: new Date(`${range.from}-01T00:00:00`), lt: new Date(toYear, toMonth, 1) };
}

function monthPresets() {
  const now = new Date();
  const thisMonth = monthKey(now);
  const threeMonthsAgo = monthKey(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const startOfYear = monthKey(new Date(now.getFullYear(), 0, 1));
  return [
    { label: "Este mês", from: thisMonth, to: thisMonth },
    { label: "Últimos 3 meses", from: threeMonthsAgo, to: thisMonth },
    { label: "Este ano", from: startOfYear, to: thisMonth },
  ];
}

/** Composição do custo mês a mês (consultas/exames/plantão), últimos 12
 * meses com lançamento — alimenta o gráfico empilhado nas duas visões. */
function monthlyComposition(rows: MetricRow[]) {
  const monthMap = new Map<string, { date: Date; consultas: number; exames: number; plantao: number }>();
  for (const r of rows) {
    const key = r.competencia.toISOString().slice(0, 7);
    const entry = monthMap.get(key) ?? { date: r.competencia, consultas: 0, exames: 0, plantao: 0 };
    entry.consultas += r.consultationValue;
    entry.exames += r.examValue;
    entry.plantao += r.hourlyValue;
    monthMap.set(key, entry);
  }
  return Array.from(monthMap.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-12)
    .map((m) => ({
      label: m.date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }),
      consultas: m.consultas,
      exames: m.exames,
      plantao: m.plantao,
    }));
}

/** % das consultas que viraram exame, por entidade (unidade ou médico),
 * ordenado do melhor pro pior. Quem não tem consulta no período fica de
 * fora — caso dos plantonistas. */
function conversionByEntity(rows: MetricRow[]) {
  const map = new Map<string, { name: string; consultas: number; exames: number }>();
  for (const r of rows) {
    const entry = map.get(r.entityId) ?? { name: r.entityName, consultas: 0, exames: 0 };
    entry.consultas += r.consultationCount;
    entry.exames += r.examCount;
    map.set(r.entityId, entry);
  }
  return Array.from(map.values())
    .filter((e) => e.consultas > 0)
    .map((e) => ({ name: e.name, conversao: (e.exames / e.consultas) * 100 }))
    .sort((a, b) => b.conversao - a.conversao);
}

const CATEGORY_SHORT: Record<string, string> = {
  CONSULTA: "consulta",
  EXAME: "exame",
  PROCEDIMENTO: "procedimento",
  PLANTAO: "plantão",
  OUTRO: "outro",
};

/** Há quanto tempo o contrato foi conferido pela última vez. Valor antigo
 * é o risco real: a tabela CT foi reajustada de 32 para 34 na planilha e
 * uma das abas ficou para trás, pagando errado por meses. */
function lastCheckedLabel(rates: { lastCheckedAt: Date | null }[]) {
  if (rates.length === 0) return null;
  const dates = rates.map((r) => r.lastCheckedAt).filter((d): d is Date => d != null);
  if (dates.length < rates.length) return { text: "nunca conferido", stale: true };

  const oldest = dates.reduce((min, d) => (d < min ? d : min));
  const days = Math.floor((Date.now() - oldest.getTime()) / 86400000);
  if (days <= 0) return { text: "conferido hoje", stale: false };
  if (days === 1) return { text: "conferido ontem", stale: false };
  if (days < 30) return { text: `conferido há ${days} dias`, stale: false };
  const months = Math.floor(days / 30);
  return {
    text: months === 1 ? "conferido há 1 mês" : `conferido há ${months} meses`,
    stale: months >= 6,
  };
}

/** Resumo do contrato do médico: quantos itens e de que naturezas. Substitui
 * o antigo "modelo de pagamento", que assumia que ele era só uma coisa. */
function contractSummary(rates: { serviceItem: { category: string } }[]) {
  if (rates.length === 0) return "Sem itens";
  const kinds = [...new Set(rates.map((r) => CATEGORY_SHORT[r.serviceItem.category] ?? "outro"))];
  return `${rates.length} ${rates.length === 1 ? "item" : "itens"} · ${kinds.join(", ")}`;
}

/** Receita e lucro do conjunto, para os KPIs. Itens sem preco (plantao,
 * auxilio) entram no repasse e nao na receita — por isso a margem cai
 * quando ha muito plantao, o que e verdade. */
function profitTotals(rows: MetricRow[]) {
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const profit = rows.reduce((s, r) => s + r.profit, 0);
  return {
    revenue,
    profit,
    marginLabel: revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : "—",
  };
}

function KpiCard({
  label,
  value,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  iconClass: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className={`size-4 ${iconClass}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

async function ConsolidatedSummary({
  companyIds,
  scopeLabel,
  range,
}: {
  companyIds: string[];
  scopeLabel: string;
  range: { from: string; to: string } | null;
}) {
  const dateWhere = dateFilter(range);

  const [companies, activeDoctors, taxBrackets, entries] = await Promise.all([
    companyIds.length === 0
      ? []
      : prisma.company.findMany({ where: { id: { in: companyIds } }, orderBy: { name: "asc" } }),
    prisma.doctor.findMany({
      where: { companyId: { in: companyIds }, active: true },
      select: { companyId: true },
    }),
    prisma.taxBracket.findMany({ where: { companyId: { in: companyIds } }, orderBy: { minValue: "asc" } }),
    prisma.doctorDailyEntry.findMany({
      where: { companyId: { in: companyIds }, ...(dateWhere ? { date: dateWhere } : {}) },
      include: { company: { select: { name: true } }, lines: { include: { serviceItem: { select: { category: true, price: true, operationalCost: true } } } } },
      orderBy: [{ date: "desc" }, { company: { name: "asc" } }],
    }),
  ]);

  // Faixas de taxa para o calculo de margem. Numa holding com unidades que
  // negociaram maquininhas diferentes isso e uma aproximacao — usa a
  // primeira faixa encontrada por intervalo.
  const brackets = taxBrackets.map((b) => ({
    minValue: Number(b.minValue),
    maxValue: b.maxValue != null ? Number(b.maxValue) : null,
    percent: Number(b.percent),
  }));

  // Na visão consolidada a "entidade" comparada dentro de cada período é a
  // unidade, não o médico — as métricas em si são exatamente as mesmas. Cada
  // dia lançado vira uma linha; a MetricsTable agrupa por mês/trimestre/etc.
  const metricRows: MetricRow[] = entries.map((e) => {
    const v = summarizeDailyEntries([e], brackets);
    return {
      id: e.id,
      competencia: e.date,
      entityId: e.companyId,
      entityName: e.company.name,
      ...v,
    };
  });

  const doctorCountByCompany = new Map<string, number>();
  for (const d of activeDoctors) {
    doctorCountByCompany.set(d.companyId, (doctorCountByCompany.get(d.companyId) ?? 0) + 1);
  }

  const byCompany = new Map<string, { id: string; name: string; consultas: number; exames: number; total: number }>();
  for (const c of companies) {
    byCompany.set(c.id, { id: c.id, name: c.name, consultas: 0, exames: 0, total: 0 });
  }
  for (const r of metricRows) {
    const entry = byCompany.get(r.entityId);
    if (!entry) continue;
    entry.consultas += r.consultationCount;
    entry.exames += r.examCount;
    entry.total += r.totalValue;
  }
  const summaries = Array.from(byCompany.values());

  const grandTotalValue = metricRows.reduce((s, r) => s + r.totalValue, 0);
  const grandProfit = profitTotals(metricRows);
  const grandTotalConsultas = metricRows.reduce((s, r) => s + r.consultationCount, 0);
  const grandTotalExames = metricRows.reduce((s, r) => s + r.examCount, 0);

  const compositionData = monthlyComposition(metricRows);
  const conversionData = conversionByEntity(metricRows);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Repasses Médicos</h1>
        <p className="text-muted-foreground text-sm">
          Custo de repasse consolidado — {scopeLabel}. Para gerenciar médicos, tipos de exame e repasses, use &quot;Ver
          detalhes&quot; ou o menu à esquerda.
        </p>
      </div>

      <MonthRangeFilter presets={monthPresets()} range={range} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Receita apurada"
          value={grandProfit.revenue > 0 ? formatCurrency(grandProfit.revenue) : "—"}
          icon={TrendingUp}
          iconClass="text-sky-500"
        />
        <KpiCard
          label="Custo de repasses"
          value={formatCurrency(grandTotalValue)}
          icon={Wallet}
          iconClass="text-amber-500"
        />
        <KpiCard
          label="Lucro previsto"
          value={grandProfit.revenue > 0 ? formatCurrency(grandProfit.profit) : "—"}
          icon={grandProfit.profit < 0 ? TrendingDown : TrendingUp}
          iconClass={grandProfit.profit < 0 ? "text-destructive" : "text-emerald-500"}
        />
        <KpiCard
          label="Margem"
          value={grandProfit.marginLabel}
          icon={Percent}
          iconClass={grandProfit.profit < 0 ? "text-destructive" : "text-emerald-500"}
        />
        <KpiCard
          label="Conversão do grupo"
          value={
            grandTotalConsultas > 0 ? `${((grandTotalExames / grandTotalConsultas) * 100).toFixed(1)}%` : "—"
          }
          icon={Activity}
          iconClass="text-violet-500"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Composição do custo por mês</CardTitle>
            <CardDescription>Consultas, exames e plantão somados de todas as unidades.</CardDescription>
          </CardHeader>
          <CardContent>
            <CostCompositionChart data={compositionData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conversão por unidade</CardTitle>
            <CardDescription>
              Percentual das consultas que viraram exame — compara desempenho, não tamanho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConversionChart
              data={conversionData}
              emptyMessage="Nenhuma unidade com consultas lançadas para comparar conversão."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{summaries.length} unidade(s)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Médicos ativos</TableHead>
                <TableHead className="text-right">Consultas</TableHead>
                <TableHead className="text-right">Exames</TableHead>
                <TableHead className="text-right">% conversão</TableHead>
                <TableHead className="text-right">Custo total</TableHead>
                <TableHead className="text-right">% do grupo</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhuma empresa nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {summaries.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{doctorCountByCompany.get(s.id) ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.consultas}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.exames}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.consultas > 0 ? `${((s.exames / s.consultas) * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(s.total)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {grandTotalValue > 0 ? `${((s.total / grandTotalValue) * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <SwitchToCompanyButton companyId={s.id} label="Ver detalhes" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Métricas de Custo</CardTitle>
          <CardDescription>
            Mesmas métricas da visão por unidade, consolidadas — expanda um período para ver cada unidade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable rows={metricRows} entityLabel="Unidade" searchPlaceholder="Buscar por unidade..." />
        </CardContent>
      </Card>
    </div>
  );
}

export default async function RepassesMedicosPage({ searchParams }: Props) {
  const params = await searchParams;
  // Filtro de período por competência (mês) — "De"/"Até" no formato
  // "YYYY-MM". Sem filtro por padrão (mostra tudo), compartilhado entre
  // "Repasses por período" e "Métricas de Custo" (e, no consolidado, entre
  // os KPIs, os gráficos e a tabela).
  const range = params.from && params.to ? { from: params.from, to: params.to } : null;

  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedSummary companyIds={companyIds} scopeLabel={scopeLabel} range={range} />;
  }

  const companyId = scope.companyId;
  const dateWhere = dateFilter(range);

  const [doctors, serviceItems, taxBrackets, entries] = await Promise.all([
    prisma.doctor.findMany({
      where: { companyId },
      include: { serviceRates: { include: { serviceItem: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.serviceItem.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.taxBracket.findMany({ where: { companyId }, orderBy: { minValue: "asc" } }),
    prisma.doctorDailyEntry.findMany({
      where: { companyId, ...(dateWhere ? { date: dateWhere } : {}) },
      include: { doctor: true, lines: { include: { serviceItem: { select: { id: true, name: true, category: true, price: true, operationalCost: true } } } } },
      orderBy: [{ date: "desc" }, { doctor: { name: "asc" } }],
    }),
  ]);

  // Client Component so aceita objeto plano — o ServiceItem cru traz
  // Decimal (price/operationalCost), que nao serializa.
  const serviceItemOptions = serviceItems.map((s) => ({ id: s.id, name: s.name }));

  const brackets = taxBrackets.map((b) => ({
    minValue: Number(b.minValue),
    maxValue: b.maxValue != null ? Number(b.maxValue) : null,
    percent: Number(b.percent),
  }));

  // Repasses ja contratados, por item — e o que permite avisar quando o
  // valor combinado com o medico passa do que sobra depois das taxas.
  const ratesByItem = new Map<string, { doctorName: string; rate: number }[]>();
  for (const d of doctors) {
    for (const r of d.serviceRates) {
      const list = ratesByItem.get(r.serviceItemId) ?? [];
      list.push({ doctorName: d.name, rate: Number(r.rate) });
      ratesByItem.set(r.serviceItemId, list);
    }
  }

  const catalogRows = serviceItems.map((s) => ({
    id: s.id,
    name: s.name,
    group: s.group,
    category: s.category,
    payer: s.payer,
    price: s.price != null ? Number(s.price) : null,
    operationalCost: Number(s.operationalCost),
    active: s.active,
    doctorRates: ratesByItem.get(s.id) ?? [],
  }));

  const catalogGroups = [...new Set(serviceItems.map((s) => s.group).filter((g): g is string => !!g))].sort();

  const doctorOptions = doctors.map((d) => ({
    id: d.id,
    name: d.name,
    serviceRates: d.serviceRates.map((r) => ({
      serviceItemId: r.serviceItemId,
      serviceItemName: r.serviceItem.name,
      rate: Number(r.rate),
      payer: r.serviceItem.payer,
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

  // Aqui a "entidade" comparada dentro de cada período é o médico (no
  // consolidado é a unidade) — as métricas em si são as mesmas.
  const metricRows: MetricRow[] = entries.map((e) => ({
    id: e.id,
    competencia: e.date,
    entityId: e.doctorId,
    entityName: e.doctor.name,
    ...summarizeDailyEntries([e], brackets),
  }));

  const totalValue = metricRows.reduce((s, r) => s + r.totalValue, 0);
  const unitProfit = profitTotals(metricRows);
  const totalConsultas = metricRows.reduce((s, r) => s + r.consultationCount, 0);
  const totalExames = metricRows.reduce((s, r) => s + r.examCount, 0);
  const activeDoctors = doctors.filter((d) => d.active).length;
  const compositionData = monthlyComposition(metricRows);
  const conversionData = conversionByEntity(metricRows);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Repasses Médicos</h1>
        <p className="text-muted-foreground text-sm">
          Contrato, atendimentos e repasses de cada médico da empresa.
        </p>
      </div>

      <MonthRangeFilter presets={monthPresets()} range={range} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Receita apurada"
          value={unitProfit.revenue > 0 ? formatCurrency(unitProfit.revenue) : "—"}
          icon={TrendingUp}
          iconClass="text-sky-500"
        />
        <KpiCard
          label="Custo de repasses"
          value={formatCurrency(totalValue)}
          icon={Wallet}
          iconClass="text-amber-500"
        />
        <KpiCard
          label="Lucro previsto"
          value={unitProfit.revenue > 0 ? formatCurrency(unitProfit.profit) : "—"}
          icon={unitProfit.profit < 0 ? TrendingDown : TrendingUp}
          iconClass={unitProfit.profit < 0 ? "text-destructive" : "text-emerald-500"}
        />
        <KpiCard
          label="Margem"
          value={unitProfit.marginLabel}
          icon={Percent}
          iconClass={unitProfit.profit < 0 ? "text-destructive" : "text-emerald-500"}
        />
        <KpiCard
          label="Conversão da unidade"
          value={totalConsultas > 0 ? `${((totalExames / totalConsultas) * 100).toFixed(1)}%` : "—"}
          icon={Activity}
          iconClass="text-violet-500"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Composição do custo por mês</CardTitle>
            <CardDescription>Consultas, exames e plantão da unidade.</CardDescription>
          </CardHeader>
          <CardContent>
            <CostCompositionChart data={compositionData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conversão por médico</CardTitle>
            <CardDescription>
              Percentual das consultas que viraram exame — plantonistas ficam de fora.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConversionChart
              data={conversionData}
              emptyMessage="Nenhum médico com consultas lançadas para comparar conversão."
              labelWidth={130}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Métricas de Custo</CardTitle>
          <CardDescription>Expanda um período para ver o detalhamento por médico.</CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable rows={metricRows} entityLabel="Médico" searchPlaceholder="Buscar por médico..." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{entries.length} dia(s) lançado(s)</CardTitle>
            <CardDescription>
              Um lançamento por dia de atendimento, como nas planilhas — expanda o mês para ver os dias.
            </CardDescription>
          </div>
          <DailyEntryFormDialog doctors={doctorOptions} />
        </CardHeader>
        <CardContent>
          <DailyEntriesTable entries={entryRows} doctors={doctorOptions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {doctors.length} médico(s)
            {doctors.length > activeDoctors && (
              <span className="text-muted-foreground font-normal text-sm"> · {activeDoctors} ativo(s)</span>
            )}
          </CardTitle>
          <DoctorFormDialog serviceItems={serviceItemOptions} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Especialização</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {doctors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum médico cadastrado ainda.
                  </TableCell>
                </TableRow>
              )}
              {doctors.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.specialty}</TableCell>
                  <TableCell>{d.document || "—"}</TableCell>
                  <TableCell>{d.paymentMethod || "—"}</TableCell>
                  <TableCell className="text-sm">
                    <span className="text-muted-foreground">{contractSummary(d.serviceRates)}</span>
                    {(() => {
                      const checked = lastCheckedLabel(d.serviceRates);
                      if (!checked) return null;
                      return (
                        <span
                          className={`block text-xs ${checked.stale ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}
                        >
                          {checked.text}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.active ? "secondary" : "outline"}>{d.active ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <DoctorFormDialog
                        serviceItems={serviceItemOptions}
                        doctor={{
                          id: d.id,
                          name: d.name,
                          specialty: d.specialty,
                          document: d.document,
                          paymentMethod: d.paymentMethod,
                          active: d.active,
                          notes: d.notes,
                          serviceRates: d.serviceRates.map((r) => ({
                            id: r.id,
                            serviceItemId: r.serviceItemId,
                            rate: Number(r.rate),
                          })),
                        }}
                      />
                      <CheckContractButton doctorId={d.id} doctorName={d.name} />
                      <DeleteButton
                        action={deleteDoctor.bind(null, d.id)}
                        title={`Excluir "${d.name}"?`}
                        description="Todos os repasses lançados para esse médico também serão excluídos."
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Catálogo de procedimentos</CardTitle>
            <CardDescription>
              Preço cobrado, taxa e custo operacional de cada item — e quanto sobra para pagar o médico.
            </CardDescription>
          </div>
          <ServiceItemFormDialog groups={catalogGroups} />
        </CardHeader>
        <CardContent>
          <ServiceCatalogTable items={catalogRows} brackets={brackets} groups={catalogGroups} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Taxas da maquininha</CardTitle>
            <CardDescription>
              Percentual descontado conforme o valor do procedimento. Alimenta o cálculo de margem do catálogo.
            </CardDescription>
          </div>
          <TaxBracketFormDialog />
        </CardHeader>
        <CardContent>
          {taxBrackets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma faixa cadastrada — sem elas a margem do catálogo é calculada sem desconto de taxa.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faixa de valor</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxBrackets.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium tabular-nums">
                      {formatCurrency(Number(b.minValue))}
                      {b.maxValue != null ? ` a ${formatCurrency(Number(b.maxValue))}` : " ou mais"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(b.percent)}%</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{b.notes || "—"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <TaxBracketFormDialog
                          bracket={{
                            id: b.id,
                            minValue: Number(b.minValue),
                            maxValue: b.maxValue != null ? Number(b.maxValue) : null,
                            percent: Number(b.percent),
                            notes: b.notes,
                          }}
                        />
                        <DeleteButton action={deleteTaxBracket.bind(null, b.id)} title="Excluir essa faixa?" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
