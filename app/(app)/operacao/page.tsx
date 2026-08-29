import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency } from "@/lib/format";
import { summarizeDailyEntries } from "@/lib/doctor-period";
import { dateFilter, monthPresets, parseMonthRange, type MonthRange } from "@/lib/month-range";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { MonthRangeFilter } from "@/components/month-range-filter";
import { KpiCard } from "@/components/kpi-card";
import { ServiceItemFormDialog } from "./service-item-form-dialog";
import { ServiceCatalogTable } from "./service-catalog-table";
import { TaxBracketFormDialog } from "./tax-bracket-form-dialog";
import { deleteTaxBracket } from "./tax-brackets-actions";
import { MetricsTable, type MetricRow } from "./metrics-table";
import { UnitsTable, type UnitRow } from "./units-table";
import { CostCompositionChart, ConversionChart } from "./metrics-charts";
import { Wallet, Activity, Percent, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
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

/** Receita e lucro do conjunto, para os KPIs. Itens sem preço (plantão,
 * auxílio) entram no repasse e não na receita — por isso a margem cai
 * quando há muito plantão, o que é verdade. */
function profitTotals(rows: MetricRow[]) {
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const profit = rows.reduce((s, r) => s + r.profit, 0);
  return {
    revenue,
    profit,
    marginLabel: revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : "—",
  };
}

function OperationKpis({ rows }: { rows: MetricRow[] }) {
  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0);
  const unpriced = rows.reduce((s, r) => s + r.unpricedCost, 0);
  const consultas = rows.reduce((s, r) => s + r.consultationCount, 0);
  const exames = rows.reduce((s, r) => s + r.examCount, 0);
  const { revenue, profit, marginLabel } = profitTotals(rows);

  // Só o repasse dos itens que TÊM preço entra na conta do lucro. Sem esse
  // número à vista, a linha de KPIs parecia errada: receita menor que custo
  // e mesmo assim lucro positivo. A diferença é o plantão e o auxílio, que
  // custam e não geram receita direta.
  const comparableCost = totalValue - unpriced;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        label="Receita apurada"
        value={revenue > 0 ? formatCurrency(revenue) : "—"}
        hint="Só dos itens com preço cadastrado"
        icon={TrendingUp}
        iconClass="text-sky-500"
      />
      <KpiCard
        label="Custo de repasses"
        value={formatCurrency(totalValue)}
        hint={
          unpriced > 0
            ? `${formatCurrency(comparableCost)} comparável · ${formatCurrency(unpriced)} sem preço`
            : undefined
        }
        icon={Wallet}
        iconClass="text-amber-500"
      />
      <KpiCard
        label="Lucro previsto"
        value={revenue > 0 ? formatCurrency(profit) : "—"}
        hint={revenue > 0 ? "Receita − repasse comparável − taxas − custo" : undefined}
        icon={profit < 0 ? TrendingDown : TrendingUp}
        iconClass={profit < 0 ? "text-destructive" : "text-emerald-500"}
      />
      <KpiCard
        label="Margem"
        value={marginLabel}
        hint="Sobre a receita apurada"
        icon={Percent}
        iconClass={profit < 0 ? "text-destructive" : "text-emerald-500"}
      />
      <KpiCard
        label="Conversão"
        value={consultas > 0 ? `${((exames / consultas) * 100).toFixed(1)}%` : "—"}
        hint={consultas > 0 ? `${exames} exames em ${consultas} consultas` : undefined}
        icon={Activity}
        iconClass="text-violet-500"
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

  // Faixas de taxa para o cálculo de margem. Numa holding com unidades que
  // negociaram maquininhas diferentes isso é uma aproximação — usa a
  // primeira faixa encontrada por intervalo.
  const brackets = taxBrackets.map((b) => ({
    minValue: Number(b.minValue),
    maxValue: b.maxValue != null ? Number(b.maxValue) : null,
    percent: Number(b.percent),
  }));

  // Na visão consolidada a "entidade" comparada dentro de cada período é a
  // unidade, não o médico — as métricas em si são exatamente as mesmas. Cada
  // dia lançado vira uma linha; a MetricsTable agrupa por mês/trimestre/etc.
  const metricRows: MetricRow[] = entries.map((e) => ({
    id: e.id,
    competencia: e.date,
    entityId: e.companyId,
    entityName: e.company.name,
    ...summarizeDailyEntries([e], brackets),
  }));

  const doctorCountByCompany = new Map<string, number>();
  for (const d of activeDoctors) {
    doctorCountByCompany.set(d.companyId, (doctorCountByCompany.get(d.companyId) ?? 0) + 1);
  }

  const byCompany = new Map<string, UnitRow>();
  for (const c of companies) {
    byCompany.set(c.id, {
      id: c.id,
      name: c.name,
      doctors: doctorCountByCompany.get(c.id) ?? 0,
      consultas: 0,
      exames: 0,
      total: 0,
      revenue: 0,
      profit: 0,
    });
  }
  for (const r of metricRows) {
    const entry = byCompany.get(r.entityId);
    if (!entry) continue;
    entry.consultas += r.consultationCount;
    entry.exames += r.examCount;
    entry.total += r.totalValue;
    entry.revenue += r.revenue;
    entry.profit += r.profit;
  }
  const summaries = Array.from(byCompany.values());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operação</h1>
        <p className="text-muted-foreground text-sm">
          Rentabilidade consolidada — {scopeLabel}. Para editar catálogo e taxas de uma unidade, use &quot;Ver
          detalhes&quot;.
        </p>
      </div>

      <MonthRangeFilter presets={monthPresets()} range={range} />

      <OperationKpis rows={metricRows} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Composição do custo por mês</CardTitle>
            <CardDescription>Consultas, exames e plantão somados de todas as unidades.</CardDescription>
          </CardHeader>
          <CardContent>
            <CostCompositionChart data={monthlyComposition(metricRows)} />
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
              data={conversionByEntity(metricRows)}
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
          <UnitsTable units={summaries} />
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

export default async function OperacaoPage({ searchParams }: Props) {
  const range = parseMonthRange(await searchParams);

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
      select: { name: true, serviceRates: { select: { serviceItemId: true, rate: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.serviceItem.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.taxBracket.findMany({ where: { companyId }, orderBy: { minValue: "asc" } }),
    prisma.doctorDailyEntry.findMany({
      where: { companyId, ...(dateWhere ? { date: dateWhere } : {}) },
      include: { doctor: { select: { name: true } }, lines: { include: { serviceItem: { select: { category: true, price: true, operationalCost: true } } } } },
      orderBy: [{ date: "desc" }, { doctor: { name: "asc" } }],
    }),
  ]);

  const brackets = taxBrackets.map((b) => ({
    minValue: Number(b.minValue),
    maxValue: b.maxValue != null ? Number(b.maxValue) : null,
    percent: Number(b.percent),
  }));

  // Repasses já contratados, por item — é o que permite avisar quando o
  // valor combinado com o médico passa do que sobra depois das taxas.
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

  // Aqui a "entidade" comparada dentro de cada período é o médico (no
  // consolidado é a unidade) — as métricas em si são as mesmas.
  const metricRows: MetricRow[] = entries.map((e) => ({
    id: e.id,
    competencia: e.date,
    entityId: e.doctorId,
    entityName: e.doctor.name,
    ...summarizeDailyEntries([e], brackets),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operação</h1>
        <p className="text-muted-foreground text-sm">
          Preço, taxa e custo de cada procedimento — e quanto sobra depois de pagar o médico.
        </p>
      </div>

      <MonthRangeFilter presets={monthPresets()} range={range} />

      <OperationKpis rows={metricRows} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Composição do custo por mês</CardTitle>
            <CardDescription>Consultas, exames e plantão da unidade.</CardDescription>
          </CardHeader>
          <CardContent>
            <CostCompositionChart data={monthlyComposition(metricRows)} />
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
              data={conversionByEntity(metricRows)}
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
