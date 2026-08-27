import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/delete-button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { DoctorFormDialog } from "./doctor-form-dialog";
import { ExamTypeFormDialog } from "./exam-type-form-dialog";
import { ReportFormDialog } from "./report-form-dialog";
import { ReportsTable } from "./reports-table";
import { MetricsTable } from "./metrics-table";
import { MonthRangeFilter } from "./month-range-filter";
import { deleteDoctor, type DoctorPaymentModel } from "./doctors-actions";
import { deleteExamType } from "./exam-types-actions";

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

function RankingBar({
  label,
  value,
  percent,
  formatValue,
  colorClass,
}: {
  label: string;
  value: number;
  percent: number;
  formatValue: (v: number) => string;
  colorClass: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatValue(value)} · {percent.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div className={`h-1.5 rounded-full ${colorClass}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

async function ConsolidatedSummary({ companyIds, scopeLabel }: { companyIds: string[]; scopeLabel: string }) {
  const companies =
    companyIds.length === 0
      ? []
      : await prisma.company.findMany({ where: { id: { in: companyIds } }, orderBy: { name: "asc" } });

  const summaries = await Promise.all(
    companies.map(async (company) => {
      const [doctorCount, reports] = await Promise.all([
        prisma.doctor.count({ where: { companyId: company.id, active: true } }),
        prisma.doctorPeriodReport.findMany({
          where: { companyId: company.id },
          include: { examCounts: true },
        }),
      ]);
      let totalValue = 0;
      let consultationCount = 0;
      let examCount = 0;
      for (const r of reports) {
        consultationCount += r.consultationCount ?? 0;
        totalValue += (r.consultationCount ?? 0) * Number(r.consultationRate ?? 0);
        totalValue += Number(r.hoursWorked ?? 0) * Number(r.hourlyRate ?? 0);
        for (const e of r.examCounts) {
          examCount += e.count;
          totalValue += e.count * Number(e.rate);
        }
      }
      return {
        id: company.id,
        name: company.name,
        doctorCount,
        reportCount: reports.length,
        totalValue,
        consultationCount,
        examCount,
      };
    })
  );

  const grandTotalValue = summaries.reduce((s, c) => s + c.totalValue, 0);
  const grandTotalConsultas = summaries.reduce((s, c) => s + c.consultationCount, 0);
  const grandTotalExames = summaries.reduce((s, c) => s + c.examCount, 0);
  const hasData = grandTotalValue > 0 || grandTotalConsultas > 0 || grandTotalExames > 0;

  const byValue = [...summaries].sort((a, b) => b.totalValue - a.totalValue);
  const byConsultas = [...summaries].sort((a, b) => b.consultationCount - a.consultationCount);
  const byExames = [...summaries].sort((a, b) => b.examCount - a.examCount);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Repasses Médicos</h1>
        <p className="text-muted-foreground text-sm">
          Resumo por empresa — {scopeLabel}. Para gerenciar médicos, tipos de exame e repasses, use &quot;Ver
          detalhes&quot; ou o menu à esquerda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{summaries.length} empresa(s)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Médicos ativos</TableHead>
                <TableHead className="text-right">Consultas</TableHead>
                <TableHead className="text-right">Exames</TableHead>
                <TableHead className="text-right">Valor total</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma empresa nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {summaries.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.doctorCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.consultationCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.examCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(s.totalValue)}</TableCell>
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
          <CardTitle>Métricas comparativas por empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasData && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sem repasses lançados ainda nesse escopo para comparar.
            </p>
          )}
          {hasData && (
            <>
              <div>
                <p className="text-sm font-medium mb-3">Valor total de repasses</p>
                <div className="space-y-3">
                  {byValue
                    .filter((c) => c.totalValue > 0)
                    .map((c) => (
                      <RankingBar
                        key={c.id}
                        label={c.name}
                        value={c.totalValue}
                        percent={grandTotalValue > 0 ? (c.totalValue / grandTotalValue) * 100 : 0}
                        formatValue={formatCurrency}
                        colorClass="bg-emerald-500"
                      />
                    ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-3">Consultas realizadas</p>
                <div className="space-y-3">
                  {byConsultas
                    .filter((c) => c.consultationCount > 0)
                    .map((c) => (
                      <RankingBar
                        key={c.id}
                        label={c.name}
                        value={c.consultationCount}
                        percent={grandTotalConsultas > 0 ? (c.consultationCount / grandTotalConsultas) * 100 : 0}
                        formatValue={(v) => `${v} consulta(s)`}
                        colorClass="bg-sky-500"
                      />
                    ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-3">Exames vendidos</p>
                <div className="space-y-3">
                  {byExames
                    .filter((c) => c.examCount > 0)
                    .map((c) => (
                      <RankingBar
                        key={c.id}
                        label={c.name}
                        value={c.examCount}
                        percent={grandTotalExames > 0 ? (c.examCount / grandTotalExames) * 100 : 0}
                        formatValue={(v) => `${v} exame(s)`}
                        colorClass="bg-amber-500"
                      />
                    ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default async function RepassesMedicosPage({ searchParams }: Props) {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedSummary companyIds={companyIds} scopeLabel={scopeLabel} />;
  }

  const companyId = scope.companyId;
  const params = await searchParams;
  // Filtro de período por competência (mês) — "De"/"Até" no formato
  // "YYYY-MM". Sem filtro por padrão (mostra tudo), compartilhado entre
  // "Repasses por período" e "Métricas de Custo".
  const range = params.from && params.to ? { from: params.from, to: params.to } : null;
  const competenciaFilter = range
    ? { gte: new Date(`${range.from}-01T00:00:00`), lte: new Date(`${range.to}-01T00:00:00`) }
    : undefined;

  const [doctors, examTypes, reports] = await Promise.all([
    prisma.doctor.findMany({
      where: { companyId },
      include: { examRates: { include: { examType: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.examType.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.doctorPeriodReport.findMany({
      where: { companyId, ...(competenciaFilter ? { competencia: competenciaFilter } : {}) },
      include: { doctor: true, examCounts: { include: { examType: true } } },
      orderBy: [{ competencia: "desc" }, { doctor: { name: "asc" } }],
    }),
  ]);

  const doctorOptions = doctors.map((d) => ({
    id: d.id,
    name: d.name,
    paymentModel: d.paymentModel,
    consultationRate: d.consultationRate != null ? Number(d.consultationRate) : null,
    hourlyRate: d.hourlyRate != null ? Number(d.hourlyRate) : null,
    examRates: d.examRates.map((r) => ({
      examTypeId: r.examTypeId,
      examTypeName: r.examType.name,
      rate: Number(r.rate),
    })),
  }));

  // Métricas: ranking por médico, split consultas vs. exames (por valor e
  // por quantidade) e rendimento (consultas por exame vendido), somando
  // todos os repasses já lançados (sem filtro de período na v1). Médicos
  // HOURLY (plantão) não entram nesse cálculo de consultas/exames — o
  // valor deles aparece à parte, em valorPlantao.
  const reportsWithValues = reports.map((r) => {
    const consultationValue = (r.consultationCount ?? 0) * Number(r.consultationRate ?? 0);
    const examValue = r.examCounts.reduce((s, e) => s + e.count * Number(e.rate), 0);
    const examCount = r.examCounts.reduce((s, e) => s + e.count, 0);
    const hourlyValue = Number(r.hoursWorked ?? 0) * Number(r.hourlyRate ?? 0);
    return {
      id: r.id,
      competencia: r.competencia,
      doctorId: r.doctorId,
      doctorName: r.doctor.name,
      paymentModel: r.doctor.paymentModel,
      notes: r.notes,
      consultationCount: r.consultationCount ?? 0,
      examCount,
      consultationValue,
      examValue,
      hoursWorked: r.hoursWorked != null ? Number(r.hoursWorked) : null,
      hourlyValue,
      totalValue: consultationValue + examValue + hourlyValue,
      examCounts: r.examCounts.map((e) => ({ id: e.id, examTypeId: e.examTypeId, count: e.count })),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Repasses Médicos</h1>
        <p className="text-muted-foreground text-sm">
          Contrato, atendimentos e repasses de cada médico da empresa.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{doctors.length} médico(s)</CardTitle>
          <DoctorFormDialog examTypes={examTypes} />
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
                        examTypes={examTypes}
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
                          examRates: d.examRates.map((r) => ({
                            id: r.id,
                            examTypeId: r.examTypeId,
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
          <ExamTypeFormDialog />
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
              {examTypes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                    Nenhum tipo de exame cadastrado ainda.
                  </TableCell>
                </TableRow>
              )}
              {examTypes.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <ExamTypeFormDialog examType={{ id: e.id, name: e.name }} />
                      <DeleteButton
                        action={deleteExamType.bind(null, e.id)}
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{reports.length} repasse(s) por período</CardTitle>
          <ReportFormDialog doctors={doctorOptions} />
        </CardHeader>
        <CardContent className="space-y-4">
          <MonthRangeFilter presets={monthPresets()} range={range} />
          <ReportsTable reports={reportsWithValues} doctors={doctorOptions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Métricas de Custo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <MonthRangeFilter presets={monthPresets()} range={range} />
          <MetricsTable reports={reportsWithValues} />
        </CardContent>
      </Card>
    </div>
  );
}
