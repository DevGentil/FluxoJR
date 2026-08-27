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
import { deleteDoctor } from "./doctors-actions";
import { deleteExamType } from "./exam-types-actions";
import { deletePeriodReport } from "./reports-actions";

function formatCompetencia(value: Date) {
  return value.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
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
      const totalValue = reports.reduce((sum, r) => {
        const consultationValue = r.consultationCount * Number(r.consultationRate);
        const examValue = r.examCounts.reduce((s, e) => s + e.count * Number(e.rate), 0);
        return sum + consultationValue + examValue;
      }, 0);
      return { id: company.id, name: company.name, doctorCount, reportCount: reports.length, totalValue };
    })
  );

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
                <TableHead className="text-right">Repasses lançados</TableHead>
                <TableHead className="text-right">Valor total</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma empresa nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {summaries.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.doctorCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.reportCount}</TableCell>
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
    </div>
  );
}

export default async function RepassesMedicosPage() {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedSummary companyIds={companyIds} scopeLabel={scopeLabel} />;
  }

  const companyId = scope.companyId;

  const [doctors, examTypes, reports] = await Promise.all([
    prisma.doctor.findMany({
      where: { companyId },
      include: { examRates: { include: { examType: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.examType.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.doctorPeriodReport.findMany({
      where: { companyId },
      include: { doctor: true, examCounts: { include: { examType: true } } },
      orderBy: [{ competencia: "desc" }, { doctor: { name: "asc" } }],
    }),
  ]);

  const doctorOptions = doctors.map((d) => ({
    id: d.id,
    name: d.name,
    consultationRate: Number(d.consultationRate),
    examRates: d.examRates.map((r) => ({
      examTypeId: r.examTypeId,
      examTypeName: r.examType.name,
      rate: Number(r.rate),
    })),
  }));

  // Métricas: ranking por médico e split consultas vs. exames, somando
  // todos os repasses já lançados (sem filtro de período na v1).
  const reportsWithValues = reports.map((r) => {
    const consultationValue = r.consultationCount * Number(r.consultationRate);
    const examValue = r.examCounts.reduce((s, e) => s + e.count * Number(e.rate), 0);
    return { ...r, consultationValue, examValue, totalValue: consultationValue + examValue };
  });

  const byDoctor = new Map<string, { name: string; total: number }>();
  let totalConsultas = 0;
  let totalExames = 0;
  for (const r of reportsWithValues) {
    const entry = byDoctor.get(r.doctorId) ?? { name: r.doctor.name, total: 0 };
    entry.total += r.totalValue;
    byDoctor.set(r.doctorId, entry);
    totalConsultas += r.consultationValue;
    totalExames += r.examValue;
  }
  const doctorRanking = Array.from(byDoctor.values()).sort((a, b) => b.total - a.total);
  const grandTotal = totalConsultas + totalExames;

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
                <TableHead>CRM</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Consulta</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {doctors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum médico cadastrado ainda.
                  </TableCell>
                </TableRow>
              )}
              {doctors.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.document || "—"}</TableCell>
                  <TableCell>{d.paymentMethod || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(Number(d.consultationRate))}
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
                          document: d.document,
                          paymentMethod: d.paymentMethod,
                          consultationRate: Number(d.consultationRate),
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>Médico</TableHead>
                <TableHead className="text-right">Consultas</TableHead>
                <TableHead className="text-right">Exames</TableHead>
                <TableHead className="text-right">Valor consultas</TableHead>
                <TableHead className="text-right">Valor exames</TableHead>
                <TableHead className="text-right">Valor total</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportsWithValues.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum repasse lançado ainda.
                  </TableCell>
                </TableRow>
              )}
              {reportsWithValues.map((r) => {
                const examCount = r.examCounts.reduce((s, e) => s + e.count, 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium capitalize">{formatCompetencia(r.competencia)}</TableCell>
                    <TableCell>{r.doctor.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.consultationCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{examCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.consultationValue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.examValue)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(r.totalValue)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <ReportFormDialog
                          doctors={doctorOptions}
                          report={{
                            id: r.id,
                            doctorId: r.doctorId,
                            competencia: r.competencia,
                            consultationCount: r.consultationCount,
                            notes: r.notes,
                            examCounts: r.examCounts.map((e) => ({
                              id: e.id,
                              examTypeId: e.examTypeId,
                              count: e.count,
                            })),
                          }}
                        />
                        <DeleteButton
                          action={deletePeriodReport.bind(null, r.id)}
                          title={`Excluir repasse de ${r.doctor.name} — ${formatCompetencia(r.competencia)}?`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Métricas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm font-medium mb-3">Ranking de médicos por valor total</p>
            {doctorRanking.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Sem repasses lançados ainda para calcular o ranking.
              </p>
            )}
            <div className="space-y-3">
              {doctorRanking.map((d) => {
                const percent = grandTotal > 0 ? (d.total / grandTotal) * 100 : 0;
                return (
                  <div key={d.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{d.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCurrency(d.total)} · {percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {grandTotal > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Consultas vs. exames (% do valor total)</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>Consultas</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrency(totalConsultas)} · {((totalConsultas / grandTotal) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-sky-500"
                      style={{ width: `${(totalConsultas / grandTotal) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>Exames</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrency(totalExames)} · {((totalExames / grandTotal) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-amber-500"
                      style={{ width: `${(totalExames / grandTotal) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
