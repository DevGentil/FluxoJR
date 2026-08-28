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
import { ReportFormDialog } from "./report-form-dialog";
import { ReportsTable } from "./reports-table";
import { MetricsTable, type MetricRow } from "./metrics-table";
import { MonthRangeFilter } from "./month-range-filter";
import { CostCompositionChart, ConversionChart } from "./metrics-charts";
import { deleteDoctor, type DoctorPaymentModel } from "./doctors-actions";
import { deleteServiceItem } from "./service-items-actions";
import { Stethoscope, Wallet, Activity, Percent } from "lucide-react";

const PAYMENT_MODEL_LABELS: Record<DoctorPaymentModel, string> = {
  CONSULTATION: "Só consulta",
  CONSULTATION_AND_EXAM: "Consulta + exame",
  HOURLY: "Plantão (por hora)",
};

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

type DecimalLike = { toString(): string };

/** Valores de um repasse a partir das taxas congeladas no lançamento —
 * compartilhado pela visão de empresa (detalhe por médico) e pela
 * consolidada (detalhe por unidade), pra as duas nunca divergirem no
 * cálculo. */
function reportValues(r: {
  consultationCount: number | null;
  consultationRate: DecimalLike | null;
  hoursWorked: DecimalLike | null;
  hourlyRate: DecimalLike | null;
  examCounts: { count: number; rate: DecimalLike }[];
}) {
  const consultationCount = r.consultationCount ?? 0;
  const consultationValue = consultationCount * Number(r.consultationRate ?? 0);
  const examCount = r.examCounts.reduce((s, e) => s + e.count, 0);
  const examValue = r.examCounts.reduce((s, e) => s + e.count * Number(e.rate), 0);
  const hourlyValue = Number(r.hoursWorked ?? 0) * Number(r.hourlyRate ?? 0);
  return {
    consultationCount,
    consultationValue,
    examCount,
    examValue,
    hoursWorked: r.hoursWorked != null ? Number(r.hoursWorked) : null,
    hourlyValue,
    totalValue: consultationValue + examValue + hourlyValue,
  };
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
  const competenciaFilter = range
    ? { gte: new Date(`${range.from}-01T00:00:00`), lte: new Date(`${range.to}-01T00:00:00`) }
    : undefined;

  const [companies, activeDoctors, reports] = await Promise.all([
    companyIds.length === 0
      ? []
      : prisma.company.findMany({ where: { id: { in: companyIds } }, orderBy: { name: "asc" } }),
    prisma.doctor.findMany({
      where: { companyId: { in: companyIds }, active: true },
      select: { companyId: true },
    }),
    prisma.doctorPeriodReport.findMany({
      where: { companyId: { in: companyIds }, ...(competenciaFilter ? { competencia: competenciaFilter } : {}) },
      include: { company: { select: { name: true } }, examCounts: true },
      orderBy: [{ competencia: "desc" }, { company: { name: "asc" } }],
    }),
  ]);

  // Na visão consolidada a "entidade" comparada dentro de cada período é a
  // unidade, não o médico — as métricas em si são exatamente as mesmas.
  const metricRows: MetricRow[] = reports.map((r) => {
    const v = reportValues(r);
    return {
      id: r.id,
      competencia: r.competencia,
      entityId: r.companyId,
      entityName: r.company.name,
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Custo total de repasses"
          value={formatCurrency(grandTotalValue)}
          icon={Wallet}
          iconClass="text-emerald-500"
        />
        <KpiCard
          label="Consultas realizadas"
          value={String(grandTotalConsultas)}
          icon={Stethoscope}
          iconClass="text-sky-500"
        />
        <KpiCard
          label="Exames vendidos"
          value={String(grandTotalExames)}
          icon={Activity}
          iconClass="text-amber-500"
        />
        <KpiCard
          label="Conversão do grupo"
          value={
            grandTotalConsultas > 0 ? `${((grandTotalExames / grandTotalConsultas) * 100).toFixed(1)}%` : "—"
          }
          icon={Percent}
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
  const competenciaFilter = range
    ? { gte: new Date(`${range.from}-01T00:00:00`), lte: new Date(`${range.to}-01T00:00:00`) }
    : undefined;

  const [doctors, serviceItems, reports] = await Promise.all([
    prisma.doctor.findMany({
      where: { companyId },
      include: { serviceRates: { include: { serviceItem: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.serviceItem.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.doctorPeriodReport.findMany({
      where: { companyId, ...(competenciaFilter ? { competencia: competenciaFilter } : {}) },
      include: { doctor: true, examCounts: { include: { serviceItem: true } } },
      orderBy: [{ competencia: "desc" }, { doctor: { name: "asc" } }],
    }),
  ]);

  // Client Component so aceita objeto plano — o ServiceItem cru traz
  // Decimal (price/operationalCost), que nao serializa.
  const serviceItemOptions = serviceItems.map((s) => ({ id: s.id, name: s.name }));

  const doctorOptions = doctors.map((d) => ({
    id: d.id,
    name: d.name,
    paymentModel: d.paymentModel,
    consultationRate: d.consultationRate != null ? Number(d.consultationRate) : null,
    hourlyRate: d.hourlyRate != null ? Number(d.hourlyRate) : null,
    serviceRates: d.serviceRates.map((r) => ({
      serviceItemId: r.serviceItemId,
      serviceItemName: r.serviceItem.name,
      rate: Number(r.rate),
    })),
  }));

  // Valores de cada repasse a partir das taxas congeladas no lançamento.
  // Médicos HOURLY (plantão) não têm consultas/exames — o valor deles entra
  // separado, em hourlyValue.
  const reportsWithValues = reports.map((r) => {
    const { consultationCount, consultationValue, examCount, examValue, hoursWorked, hourlyValue, totalValue } =
      reportValues(r);
    return {
      id: r.id,
      competencia: r.competencia,
      doctorId: r.doctorId,
      doctorName: r.doctor.name,
      paymentModel: r.doctor.paymentModel,
      notes: r.notes,
      consultationCount,
      examCount,
      consultationValue,
      examValue,
      hoursWorked,
      hourlyValue,
      totalValue,
      examCounts: r.examCounts.map((e) => ({ id: e.id, serviceItemId: e.serviceItemId, count: e.count })),
    };
  });

  // Aqui a "entidade" comparada dentro de cada período é o médico (no
  // consolidado é a unidade) — as métricas em si são as mesmas.
  const metricRows: MetricRow[] = reportsWithValues.map((r) => ({
    ...r,
    entityId: r.doctorId,
    entityName: r.doctorName,
  }));

  const totalValue = metricRows.reduce((s, r) => s + r.totalValue, 0);
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Custo total de repasses"
          value={formatCurrency(totalValue)}
          icon={Wallet}
          iconClass="text-emerald-500"
        />
        <KpiCard
          label="Consultas realizadas"
          value={String(totalConsultas)}
          icon={Stethoscope}
          iconClass="text-sky-500"
        />
        <KpiCard label="Exames vendidos" value={String(totalExames)} icon={Activity} iconClass="text-amber-500" />
        <KpiCard
          label="Conversão da unidade"
          value={totalConsultas > 0 ? `${((totalExames / totalConsultas) * 100).toFixed(1)}%` : "—"}
          icon={Percent}
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
          <CardTitle>{reports.length} repasse(s) lançado(s)</CardTitle>
          <ReportFormDialog doctors={doctorOptions} />
        </CardHeader>
        <CardContent>
          <ReportsTable reports={reportsWithValues} doctors={doctorOptions} />
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
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {doctors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                  <TableCell className="text-muted-foreground text-sm">
                    {PAYMENT_MODEL_LABELS[d.paymentModel]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.paymentModel === "HOURLY"
                      ? d.hourlyRate != null
                        ? `${formatCurrency(Number(d.hourlyRate))}/h`
                        : "—"
                      : d.consultationRate != null
                        ? formatCurrency(Number(d.consultationRate))
                        : "—"}
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
                          paymentModel: d.paymentModel,
                          consultationRate: d.consultationRate != null ? Number(d.consultationRate) : null,
                          hourlyRate: d.hourlyRate != null ? Number(d.hourlyRate) : null,
                          active: d.active,
                          notes: d.notes,
                          serviceRates: d.serviceRates.map((r) => ({
                            id: r.id,
                            serviceItemId: r.serviceItemId,
                            rate: Number(r.rate),
                          })),
                        }}
                      />
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
          <CardTitle>Tipos de exame</CardTitle>
          <ServiceItemFormDialog />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                    Nenhum tipo de exame cadastrado ainda.
                  </TableCell>
                </TableRow>
              )}
              {serviceItems.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <ServiceItemFormDialog serviceItem={{ id: e.id, name: e.name }} />
                      <DeleteButton
                        action={deleteServiceItem.bind(null, e.id)}
                        title={`Excluir "${e.name}"?`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
