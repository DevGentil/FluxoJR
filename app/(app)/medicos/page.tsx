import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/delete-button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { KpiCard } from "@/components/kpi-card";
import { DoctorFormDialog } from "./doctor-form-dialog";
import { CheckContractButton } from "./check-contract-button";
import { deleteDoctor } from "./doctors-actions";
import { Users, FileSignature, TriangleAlert, History } from "lucide-react";
import { contractOn } from "@/lib/doctor-rates";
import { parseDateOnly, todayDateOnly, toDateOnly } from "@/lib/date-only";
import { formatDate } from "@/lib/format";

/** Data de referência das telas: o contrato vigente é o de hoje. */
const hoje = parseDateOnly(todayDateOnly());

const CATEGORY_SHORT: Record<string, string> = {
  CONSULTA: "consulta",
  EXAME: "exame",
  PROCEDIMENTO: "procedimento",
  PLANTAO: "plantão",
  OUTRO: "outro",
};

/** Há quanto tempo o contrato foi conferido pela última vez. Valor antigo
 * é o risco real: nas planilhas, um reajuste de ECG de R$15 para R$10 só
 * pegou em algumas abas, e o resto seguiu pagando o valor velho. */
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

function isStale(rates: { lastCheckedAt: Date | null }[]) {
  return lastCheckedLabel(rates)?.stale ?? false;
}

async function ConsolidatedSummary({ companyIds, scopeLabel }: { companyIds: string[]; scopeLabel: string }) {
  const [companies, doctors] = await Promise.all([
    companyIds.length === 0
      ? []
      : prisma.company.findMany({ where: { id: { in: companyIds } }, orderBy: { name: "asc" } }),
    prisma.doctor.findMany({
      where: { companyId: { in: companyIds } },
      select: {
        companyId: true,
        active: true,
        // serviceItemId e validFrom são o que permite reduzir as versões
        // ao contrato vigente — sem eles, um reajuste contaria como dois
        // itens contratados.
        serviceRates: { select: { serviceItemId: true, validFrom: true, lastCheckedAt: true } },
      },
    }),
  ]);

  const byCompany = new Map<
    string,
    { id: string; name: string; ativos: number; inativos: number; itens: number; aConferir: number }
  >();
  for (const c of companies) {
    byCompany.set(c.id, { id: c.id, name: c.name, ativos: 0, inativos: 0, itens: 0, aConferir: 0 });
  }
  for (const d of doctors) {
    const entry = byCompany.get(d.companyId);
    if (!entry) continue;
    if (d.active) entry.ativos += 1;
    else entry.inativos += 1;
    entry.itens += contractOn(d.serviceRates, hoje).length;
    if (isStale(contractOn(d.serviceRates, hoje))) entry.aConferir += 1;
  }
  const summaries = Array.from(byCompany.values());

  const totalAtivos = summaries.reduce((s, c) => s + c.ativos, 0);
  const totalItens = summaries.reduce((s, c) => s + c.itens, 0);
  const totalAConferir = summaries.reduce((s, c) => s + c.aConferir, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Médicos</h1>
        <p className="text-muted-foreground text-sm">
          Corpo clínico e contratos de cada unidade — {scopeLabel}. Para cadastrar ou editar um contrato, use
          &quot;Ver detalhes&quot;.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Médicos ativos" value={String(totalAtivos)} icon={Users} iconClass="text-sky-500" />
        <KpiCard
          label="Itens contratados"
          value={String(totalItens)}
          icon={FileSignature}
          iconClass="text-violet-500"
        />
        <KpiCard
          label="Contratos a conferir"
          value={String(totalAConferir)}
          hint={totalAConferir > 0 ? "Nunca conferidos ou parados há 6+ meses" : "Todos em dia"}
          icon={TriangleAlert}
          iconClass={totalAConferir > 0 ? "text-amber-500" : "text-muted-foreground"}
        />
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
                <TableHead className="text-right">Ativos</TableHead>
                <TableHead className="text-right">Inativos</TableHead>
                <TableHead className="text-right">Itens contratados</TableHead>
                <TableHead className="text-right">A conferir</TableHead>
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
                  <TableCell className="text-right tabular-nums">{s.ativos}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{s.inativos}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.itens}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${s.aConferir > 0 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}
                  >
                    {s.aConferir || "—"}
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
    </div>
  );
}

export default async function MedicosPage() {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedSummary companyIds={companyIds} scopeLabel={scopeLabel} />;
  }

  const companyId = scope.companyId;
  const [doctors, serviceItems] = await Promise.all([
    prisma.doctor.findMany({
      where: { companyId },
      include: { serviceRates: { include: { serviceItem: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.serviceItem.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
  ]);

  // Client Component só aceita objeto plano — o ServiceItem cru traz
  // Decimal (price/operationalCost), que não serializa.
  const serviceItemOptions = serviceItems.map((s) => ({ id: s.id, name: s.name }));

  const activeDoctors = doctors.filter((d) => d.active).length;
  const totalItens = doctors.reduce((s, d) => s + contractOn(d.serviceRates, hoje).length, 0);
  const aConferir = doctors.filter((d) => isStale(contractOn(d.serviceRates, hoje))).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Médicos</h1>
        <p className="text-muted-foreground text-sm">
          Cadastro e contrato de cada médico — o valor combinado por item é o que dá o valor de cada dia
          lançado em Repasses Médicos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Médicos ativos"
          value={String(activeDoctors)}
          hint={doctors.length > activeDoctors ? `${doctors.length - activeDoctors} inativo(s)` : undefined}
          icon={Users}
          iconClass="text-sky-500"
        />
        <KpiCard
          label="Itens contratados"
          value={String(totalItens)}
          icon={FileSignature}
          iconClass="text-violet-500"
        />
        <KpiCard
          label="Contratos a conferir"
          value={String(aConferir)}
          hint={aConferir > 0 ? "Nunca conferidos ou parados há 6+ meses" : "Todos em dia"}
          icon={TriangleAlert}
          iconClass={aConferir > 0 ? "text-amber-500" : "text-muted-foreground"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{doctors.length} médico(s)</CardTitle>
            <CardDescription>
              Confira o contrato depois de cada renegociação — é o que evita pagar pelo valor velho.
            </CardDescription>
          </div>
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
              {doctors.map((d) => {
                const vigentes = contractOn(d.serviceRates, hoje);
                const checked = lastCheckedLabel(vigentes);
                // Toda versão que não é a vigente é um reajuste já
                // registrado — o histórico que a planilha não guardava.
                const reajustes = d.serviceRates.length - vigentes.length;
                const ultimoReajuste = vigentes.reduce<Date | null>(
                  (mais, r) => (mais == null || r.validFrom > mais ? r.validFrom : mais),
                  null
                );
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.specialty}</TableCell>
                    <TableCell>{d.document || "—"}</TableCell>
                    <TableCell>{d.paymentMethod || "—"}</TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground">{contractSummary(vigentes)}</span>
                      {ultimoReajuste && (
                        <span className="block text-xs text-muted-foreground">
                          Vigente desde {formatDate(ultimoReajuste)}
                        </span>
                      )}
                      {reajustes > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <History className="size-3 shrink-0" />
                          {reajustes} {reajustes === 1 ? "reajuste" : "reajustes"} no histórico
                        </span>
                      )}
                      {checked && (
                        <span
                          className={`block text-xs ${checked.stale ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}
                        >
                          {checked.text}
                        </span>
                      )}
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
                            // Só o que está vigente hoje vai para o
                            // formulário — o histórico fica no banco e
                            // aparece resumido na coluna do contrato.
                            serviceRates: contractOn(d.serviceRates, hoje).map((r) => ({
                              id: r.id,
                              serviceItemId: r.serviceItemId,
                              rate: Number(r.rate),
                              validFrom: toDateOnly(r.validFrom),
                            })),
                          }}
                        />
                        <CheckContractButton doctorId={d.id} doctorName={d.name} />
                        <DeleteButton
                          action={deleteDoctor.bind(null, d.id)}
                          title={`Excluir "${d.name}"?`}
                          description="Só é possível excluir quem ainda não tem nenhum dia lançado. Para tirar da rotina um médico que já atendeu, edite e desmarque &quot;Médico ativo&quot;."
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
    </div>
  );
}
