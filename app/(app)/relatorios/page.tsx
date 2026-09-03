import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency, formatDate, formatBytes } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/pagination";
import { POR_PAGINA, lerPagina } from "@/lib/paginacao";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { PeriodFilter } from "@/components/period-filter";
import { startOfDay, endOfDay, todayDateOnly, startOfWeek, firstDayOfMonth } from "@/lib/date-only";
import { DeleteButton } from "@/components/delete-button";
import { DreReportFormDialog } from "./dre-report-form-dialog";
import { deleteDreReport } from "./dre-reports-actions";
import { ExportCsvButton } from "@/components/export-csv-button";
import { SortableHead } from "@/components/sortable-head";
import { parseSort, sortBy, type Sort } from "@/lib/sorting";
import { Download, FileText } from "lucide-react";

interface Props {
  searchParams: Promise<{
    from?: string;
    to?: string;
    /** Ordem de cada tabela: `e` entradas, `s` saídas, `c` comparativo. */
    esort?: string;
    edir?: string;
    ssort?: string;
    sdir?: string;
    csort?: string;
    cdir?: string;
    /** Página da lista de DREs realizados. */
    page?: string;
  }>;
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

const COLUNAS_DRE = ["categoria", "fornecedor", "centro", "total"] as const;
type ColunaDre = (typeof COLUNAS_DRE)[number];

const CHAVES_DRE: Record<ColunaDre, (r: ReportRow) => string | number> = {
  categoria: (r) => r.categoria,
  fornecedor: (r) => r.fornecedor,
  centro: (r) => r.centroCusto,
  total: (r) => r.total,
};

function CategorySection({
  title,
  colorClass,
  rows,
  totalLabel,
  total,
  emptyLabel,
  prefix,
  sort,
}: {
  title: string;
  colorClass: string;
  /** Já na ordem escolhida — quem ordena é a página, para o CSV sair na
   * mesma ordem que está na tela. */
  rows: ReportRow[];
  totalLabel: string;
  total: number;
  emptyLabel: string;
  /** Entradas e saídas são a mesma tabela duas vezes na mesma tela; cada
   * uma precisa dos próprios parâmetros de ordem. */
  prefix: string;
  /** A ordem aplicada, só para o cabeçalho marcar a coluna certa. */
  sort: Sort<ColunaDre>;
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
              <SortableHead field="categoria" prefix={prefix} current={sort}>
                Categoria
              </SortableHead>
              <SortableHead field="fornecedor" prefix={prefix} current={sort}>
                Fornecedor
              </SortableHead>
              <SortableHead field="centro" prefix={prefix} current={sort}>
                Centro de custo
              </SortableHead>
              <SortableHead field="total" prefix={prefix} first="desc" align="right" className="text-right" current={sort}>
                Total
              </SortableHead>
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

interface CompanySummary {
  companyId: string;
  companyName: string;
  income: number;
  expense: number;
}

const COLUNAS_EMPRESA = ["empresa", "entradas", "saidas", "resultado", "margem"] as const;
type ColunaEmpresa = (typeof COLUNAS_EMPRESA)[number];

/** Margem é razão, não coluna guardada: ordenar pelo texto "12,3%" colocaria
 * 9% depois de 12%. Empresa sem entrada nenhuma vai com `null` — não dá para
 * calcular margem sobre zero, e fingir 0% mudaria o ranking. */
const CHAVES_EMPRESA: Record<ColunaEmpresa, (s: CompanySummary) => string | number | null> = {
  empresa: (s) => s.companyName,
  entradas: (s) => s.income,
  saidas: (s) => s.expense,
  resultado: (s) => s.income - s.expense,
  margem: (s) => (s.income > 0 ? (s.income - s.expense) / s.income : null),
};

/** DRE comparativo: uma linha por empresa (entradas, saídas, resultado,
 * margem) em vez de um DRE único somando tudo — reflete como a holding
 * realmente analisa os números (por unidade), com atalho pro DRE completo
 * daquela empresa. */
function CompanyComparisonTable({ rows, sort }: { rows: ReportRow[]; sort: Sort<ColunaEmpresa> }) {
  const agrupadas: CompanySummary[] = [];
  for (const r of rows) {
    let summary = agrupadas.find((s) => s.companyId === r.companyId);
    if (!summary) {
      summary = { companyId: r.companyId, companyName: r.empresa, income: 0, expense: 0 };
      agrupadas.push(summary);
    }
    if (r.tipo === "INCOME") summary.income += r.total;
    else summary.expense += r.total;
  }
  const summaries = sortBy(agrupadas, CHAVES_EMPRESA[sort.field], sort.dir);

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
              <SortableHead field="empresa" prefix="c" current={sort}>
                Empresa
              </SortableHead>
              <SortableHead field="entradas" prefix="c" first="desc" align="right" className="text-right" current={sort}>
                Entradas
              </SortableHead>
              <SortableHead field="saidas" prefix="c" first="desc" align="right" className="text-right" current={sort}>
                Saídas
              </SortableHead>
              <SortableHead field="resultado" prefix="c" first="desc" align="right" className="text-right" current={sort}>
                Resultado
              </SortableHead>
              <SortableHead field="margem" prefix="c" first="desc" align="right" className="text-right" current={sort}>
                Margem
              </SortableHead>
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
async function DreReportsSection({
  companyId,
  page,
  params,
}: {
  companyId: string;
  page: number;
  /** O resto da URL — período e ordenação das outras tabelas da tela.
   * Sem isso, virar a página dos DREs jogaria o relatório inteiro de volta
   * para o período padrão. */
  params: Record<string, string | undefined>;
}) {
  const where = { companyId };
  const [total, reports] = await Promise.all([
    prisma.dreReport.count({ where }),
    prisma.dreReport.findMany({
      where,
      // Competência desce; o id desempata dois arquivos do mesmo mês.
      orderBy: [{ competencia: "desc" }, { id: "asc" }],
      skip: (page - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{total} DRE(s) realizado(s)</CardTitle>
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
                <TableCell className="font-medium first-letter:uppercase">{formatCompetencia(r.competencia)}</TableCell>
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
        <Pagination
          total={total}
          page={page}
          pageSize={POR_PAGINA}
          basePath="/relatorios"
          params={params}
          rotulo="DREs"
        />
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
                <TableCell className="first-letter:uppercase">{formatCompetencia(s.lastCompetencia)}</TableCell>
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
  const incomeRows = allRows.filter((r) => r.tipo === "INCOME");
  const expenseRows = allRows.filter((r) => r.tipo === "EXPENSE");
  // Maior valor primeiro é o padrão das duas tabelas — "para onde foi o
  // dinheiro" começa pelo que pesou mais.
  const padraoDre: Sort<ColunaDre> = { field: "total", dir: "desc" };
  const ordemEntradas = parseSort({ sort: params.esort, dir: params.edir }, COLUNAS_DRE, padraoDre);
  const ordemSaidas = parseSort({ sort: params.ssort, dir: params.sdir }, COLUNAS_DRE, padraoDre);
  // No comparativo o padrão é alfabético: a lista de unidades é a mesma
  // toda vez, e achar uma unidade específica é mais frequente do que
  // rankeá-las.
  const ordemEmpresas = parseSort({ sort: params.csort, dir: params.cdir }, COLUNAS_EMPRESA, {
    field: "empresa",
    dir: "asc",
  });
  const entradas = sortBy(incomeRows, CHAVES_DRE[ordemEntradas.field], ordemEntradas.dir);
  const saidas = sortBy(expenseRows, CHAVES_DRE[ordemSaidas.field], ordemSaidas.dir);
  const totalIncome = incomeRows.reduce((s, r) => s + r.total, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.total, 0);
  const result = totalIncome - totalExpense;

  // Exportação CSV só faz sentido no DRE de uma empresa específica — o
  // comparativo consolidado é pra visualizar na tela, não pra planilha.
  const csvHeaders = ["Categoria", "Fornecedor", "Tipo", "Centro de Custo", "Total"];
  // O CSV sai na mesma ordem da tela — exportar algo diferente do que está
  // à vista é a armadilha silenciosa que a paginação já ensinou.
  const csvRows: (string | number)[][] = [...entradas, ...saidas].map((r) => [
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
        <div className="flex flex-wrap gap-2">
          {/* O DRE impresso é sempre de UMA competência: é assim que a
              planilha é fechada e entregue ao contador. O filtro da tela
              aceita qualquer intervalo, então o mês do documento é o mês em
              que o período termina. */}
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={`/documento/dre/${range.to.slice(0, 7)}`}
                target="_blank"
                rel="noopener"
              />
            }
          >
            <FileText className="size-4" />
            DRE em PDF
          </Button>
          {!isConsolidated && (
            <ExportCsvButton
              headers={csvHeaders}
              rows={csvRows}
              fileName={`dre-${range.from}-a-${range.to}.csv`}
            />
          )}
        </div>
      </div>

      <PeriodFilter basePath="/relatorios" presets={presets} range={range} />

      {isConsolidated ? (
        <>
          <CompanyComparisonTable rows={allRows} sort={ordemEmpresas} />
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
              rows={entradas}
              totalLabel="Total de entradas"
              total={totalIncome}
              emptyLabel="Nenhuma entrada no período selecionado."
              prefix="e"
              sort={ordemEntradas}
            />
            <CategorySection
              title="Saídas por categoria"
              colorClass="text-red-600 dark:text-red-400"
              rows={saidas}
              totalLabel="Total de saídas"
              total={totalExpense}
              emptyLabel="Nenhuma saída no período selecionado."
              prefix="s"
              sort={ordemSaidas}
            />
          </div>

          {scope.type === "company" && (
            <DreReportsSection companyId={scope.companyId} page={lerPagina(params.page)} params={params} />
          )}
        </>
      )}
    </div>
  );
}
