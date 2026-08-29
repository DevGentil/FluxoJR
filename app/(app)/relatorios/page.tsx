import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency, formatDate, formatBytes } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { PeriodFilter } from "@/components/period-filter";
import { startOfDay, endOfDay, todayDateOnly, startOfWeek, firstDayOfMonth } from "@/lib/date-only";
import { DeleteButton } from "@/components/delete-button";
import { DreReportFormDialog } from "./dre-report-form-dialog";
import { deleteDreReport } from "./dre-reports-actions";
import { ExportCsvButton } from "@/components/export-csv-button";
import { Download } from "lucide-react";

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

interface ReportRow {
  companyId: string;
  empresa: string;
  categoria: string;
  fornecedor: string;
  tipo: "INCOME" | "EXPENSE";
  centroCusto: string;
  total: number;
}

/** Os atalhos de período trabalham em datas de calendário. Passar por
 * `toISOString()` sobre o relógio local devolvia o dia seguinte depois das
 * 21h no horário de Brasília, e "hoje" virava amanhã toda noite. */
function presetRange(kind: "today" | "week" | "month") {
  const to = todayDateOnly();
  if (kind === "week") return { from: startOfWeek(to), to };
  if (kind === "month") return { from: firstDayOfMonth(to), to };
  return { from: to, to };
}

function defaultRange() {
  return presetRange("month");
}

function formatCompetencia(value: Date) {
  return value.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function resultColor(value: number) {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "";
}

function CategorySection({
  title,
  colorClass,
  rows,
  totalLabel,
  total,
  emptyLabel,
}: {
  title: string;
  colorClass: string;
  rows: ReportRow[];
  totalLabel: string;
  total: number;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={colorClass}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Centro de custo</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.categoria}</TableCell>
                <TableCell>{r.fornecedor}</TableCell>
                <TableCell>{r.centroCusto}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>{totalLabel}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(total)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}

/** DRE comparativo: uma linha por empresa (entradas, saídas, resultado,
 * margem) em vez de um DRE único somando tudo — reflete como a holding
 * realmente analisa os números (por unidade), com atalho pro DRE completo
 * daquela empresa. */
function CompanyComparisonTable({ rows }: { rows: ReportRow[] }) {
  interface CompanySummary {
    companyId: string;
    companyName: string;
    income: number;
    expense: number;
  }
  const summaries: CompanySummary[] = [];
  for (const r of rows) {
    let summary = summaries.find((s) => s.companyId === r.companyId);
    if (!summary) {
      summary = { companyId: r.companyId, companyName: r.empresa, income: 0, expense: 0 };
      summaries.push(summary);
    }
    if (r.tipo === "INCOME") summary.income += r.total;
    else summary.expense += r.total;
  }
  summaries.sort((a, b) => a.companyName.localeCompare(b.companyName));

  const totalIncome = summaries.reduce((s, c) => s + c.income, 0);
  const totalExpense = summaries.reduce((s, c) => s + c.expense, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>DRE por empresa</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead className="text-right">Entradas</TableHead>
              <TableHead className="text-right">Saídas</TableHead>
              <TableHead className="text-right">Resultado</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma movimentação no período selecionado.
                </TableCell>
              </TableRow>
            )}
            {summaries.map((s) => {
              const result = s.income - s.expense;
              const margin = s.income > 0 ? (result / s.income) * 100 : null;
              return (
                <TableRow key={s.companyId}>
                  <TableCell className="font-medium">{s.companyName}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(s.income)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(s.expense)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${resultColor(result)}`}>
                    {formatCurrency(result)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {margin === null ? "—" : `${margin.toFixed(1)}%`}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <SwitchToCompanyButton companyId={s.companyId} label="Ver DRE" />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {summaries.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell>Total consolidado</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totalIncome)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totalExpense)}</TableCell>
                <TableCell className={`text-right tabular-nums ${resultColor(totalIncome - totalExpense)}`}>
                  {formatCurrency(totalIncome - totalExpense)}
                </TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}

/** DREs realizados: arquivos oficiais (Excel/PDF) fechados pelo contador
 * para um mês específico, guardados como referência ao lado do DRE que o
 * sistema calcula automaticamente. Só existe no escopo de uma empresa —
 * cada arquivo pertence a uma unidade específica. */
async function DreReportsSection({ companyId }: { companyId: string }) {
  const reports = await prisma.dreReport.findMany({
    where: { companyId },
    orderBy: { competencia: "desc" },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>DREs realizados</CardTitle>
        <DreReportFormDialog />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead>Observações</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Enviado em</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum DRE realizado enviado ainda.
                </TableCell>
              </TableRow>
            )}
            {reports.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium capitalize">{formatCompetencia(r.competencia)}</TableCell>
                <TableCell className="max-w-64 truncate">{r.fileName}</TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">{r.notes || "—"}</TableCell>
                <TableCell>{formatBytes(r.size)}</TableCell>
                <TableCell>{formatDate(r.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      nativeButton={false}
                      render={<a href={`/api/dre-reports/${r.id}`} />}
                    >
                      <Download className="size-4" />
                    </Button>
                    <DeleteButton
                      action={deleteDreReport.bind(null, r.id)}
                      title={`Excluir o DRE de ${formatCompetencia(r.competencia)}?`}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Resumo dos DREs realizados por empresa na visão de grupo/holding — uma
 * linha por empresa (quantos arquivos, mês mais recente) em vez de listar
 * cada anexo, mesmo padrão já usado nas outras telas consolidadas. */
async function DreReportsConsolidatedSummary({ companyIds }: { companyIds: string[] }) {
  const reports =
    companyIds.length === 0
      ? []
      : await prisma.dreReport.findMany({
          where: { companyId: { in: companyIds } },
          include: { company: true },
        });

  interface CompanySummary {
    companyId: string;
    companyName: string;
    count: number;
    lastCompetencia: Date;
  }
  const summaries: CompanySummary[] = [];
  for (const r of reports) {
    let summary = summaries.find((s) => s.companyId === r.companyId);
    if (!summary) {
      summary = { companyId: r.companyId, companyName: r.company.name, count: 0, lastCompetencia: r.competencia };
      summaries.push(summary);
    }
    summary.count += 1;
    if (r.competencia > summary.lastCompetencia) summary.lastCompetencia = r.competencia;
  }
  summaries.sort((a, b) => a.companyName.localeCompare(b.companyName));

  return (
    <Card>
      <CardHeader>
        <CardTitle>DREs realizados por empresa</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead className="text-right">Arquivos</TableHead>
              <TableHead>Mês mais recente</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Nenhum DRE realizado enviado nesse escopo.
                </TableCell>
              </TableRow>
            )}
            {summaries.map((s) => (
              <TableRow key={s.companyId}>
                <TableCell className="font-medium">{s.companyName}</TableCell>
                <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                <TableCell className="capitalize">{formatCompetencia(s.lastCompetencia)}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <SwitchToCompanyButton companyId={s.companyId} label="Ver DREs" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function RelatoriosPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = { from: params.from || defaultRange().from, to: params.to || defaultRange().to };
  const scope = await getActiveScope();
  const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
  const isConsolidated = scope.type !== "company";
  const presets = [
    { label: "Hoje", ...presetRange("today") },
    { label: "Esta semana", ...presetRange("week") },
    { label: "Este mês", ...presetRange("month") },
  ];

  const transactions =
    companyIds.length === 0
      ? []
      : await prisma.transaction.findMany({
          where: {
            companyId: { in: companyIds },
            date: { gte: startOfDay(range.from), lte: endOfDay(range.to) },
            transferCompanyId: null,
          },
          include: { category: true, company: true, supplier: true },
        });

  const grouped = new Map<string, ReportRow>();
  for (const t of transactions) {
    const empresa = t.company.name;
    const categoria = t.category?.name ?? "Sem categoria";
    const fornecedor = t.supplier?.name ?? "—";
    const centroCusto = t.category?.costCenter ?? "—";
    const key = `${empresa}__${categoria}__${fornecedor}__${centroCusto}__${t.type}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.total += Number(t.amount);
    } else {
      grouped.set(key, {
        companyId: t.companyId,
        empresa,
        categoria,
        fornecedor,
        tipo: t.type as "INCOME" | "EXPENSE",
        centroCusto,
        total: Number(t.amount),
      });
    }
  }

  const allRows = Array.from(grouped.values());
  const incomeRows = allRows.filter((r) => r.tipo === "INCOME").sort((a, b) => b.total - a.total);
  const expenseRows = allRows.filter((r) => r.tipo === "EXPENSE").sort((a, b) => b.total - a.total);
  const totalIncome = incomeRows.reduce((s, r) => s + r.total, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.total, 0);
  const result = totalIncome - totalExpense;

  // Exportação CSV só faz sentido no DRE de uma empresa específica — o
  // comparativo consolidado é pra visualizar na tela, não pra planilha.
  const csvHeaders = ["Categoria", "Fornecedor", "Tipo", "Centro de Custo", "Total"];
  const csvRows: (string | number)[][] = [...incomeRows, ...expenseRows].map((r) => [
    r.categoria,
    r.fornecedor,
    r.tipo === "INCOME" ? "Entrada" : "Saída",
    r.centroCusto,
    r.total,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-muted-foreground text-sm">
            {isConsolidated
              ? `DRE comparativo por empresa — ${scopeLabel}.`
              : `DRE simplificado por categoria e centro de custo — ${scopeLabel}.`}
          </p>
        </div>
        {!isConsolidated && (
          <ExportCsvButton
            headers={csvHeaders}
            rows={csvRows}
            fileName={`dre-${range.from}-a-${range.to}.csv`}
          />
        )}
      </div>

      <PeriodFilter basePath="/relatorios" presets={presets} range={range} />

      {isConsolidated ? (
        <>
          <CompanyComparisonTable rows={allRows} />
          <DreReportsConsolidatedSummary companyIds={companyIds} />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Total de entradas</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalIncome)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Total de saídas</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">
                {formatCurrency(totalExpense)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Resultado do período</CardTitle>
              </CardHeader>
              <CardContent className={`text-xl font-semibold tabular-nums ${resultColor(result)}`}>
                {formatCurrency(result)}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CategorySection
              title="Entradas por categoria"
              colorClass="text-emerald-600 dark:text-emerald-400"
              rows={incomeRows}
              totalLabel="Total de entradas"
              total={totalIncome}
              emptyLabel="Nenhuma entrada no período selecionado."
            />
            <CategorySection
              title="Saídas por categoria"
              colorClass="text-red-600 dark:text-red-400"
              rows={expenseRows}
              totalLabel="Total de saídas"
              total={totalExpense}
              emptyLabel="Nenhuma saída no período selecionado."
            />
          </div>

          {scope.type === "company" && <DreReportsSection companyId={scope.companyId} />}
        </>
      )}
    </div>
  );
}
