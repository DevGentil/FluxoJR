import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { CashClosingFormDialog } from "./cash-closing-form-dialog";
import { CashClosingRow, type CashClosingRowData } from "./cash-closing-row";
import { deleteCashClosing } from "./actions";
import { formatDate } from "@/lib/format";

function toLines(lines: { id: string; type: string; label: string; amount: unknown; order: number }[], type: "SANGRIA" | "PAGAMENTO") {
  return lines
    .filter((l) => l.type === type)
    .sort((a, b) => a.order - b.order)
    .map((l) => ({ id: l.id, label: l.label, amount: Number(l.amount) }));
}

export default async function FechamentoCaixaPage() {
  const scope = await getActiveScope();
  const scopeLabel = await getScopeLabel(scope);

  if (scope.type === "company") {
    const [closings, accounts] = await Promise.all([
      prisma.cashClosing.findMany({
        where: { companyId: scope.companyId },
        include: { lines: true, account: true },
        orderBy: { date: "desc" },
      }),
      prisma.account.findMany({ where: { companyId: scope.companyId }, orderBy: { name: "asc" } }),
    ]);
    const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Fechamento de Caixa</h1>
            <p className="text-muted-foreground text-sm">
              Sangrias e pagamentos em dinheiro do dia, confrontados com a contagem física — {scopeLabel}.
            </p>
          </div>
          <CashClosingFormDialog accounts={accountOptions} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{closings.length} fechamento(s)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Sangrias</TableHead>
                  <TableHead className="text-right">Pagamentos</TableHead>
                  <TableHead className="text-right">Valor do caixa</TableHead>
                  <TableHead className="text-right">Dinheiro contado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {closings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum fechamento cadastrado ainda.
                    </TableCell>
                  </TableRow>
                )}
                {closings.map((closing) => {
                  const countedCash = Number(closing.countedCash);
                  const sangrias = toLines(closing.lines, "SANGRIA");
                  const pagamentos = toLines(closing.lines, "PAGAMENTO");
                  const rowData: CashClosingRowData = {
                    id: closing.id,
                    date: closing.date,
                    accountName: closing.account.name,
                    countedCash,
                    notes: closing.notes,
                    sangrias,
                    pagamentos,
                  };
                  return (
                    <CashClosingRow
                      key={closing.id}
                      closing={rowData}
                      actions={
                        <>
                          <CashClosingFormDialog
                            accounts={accountOptions}
                            closing={{
                              id: closing.id,
                              date: closing.date,
                              accountId: closing.accountId,
                              countedCash,
                              notes: closing.notes,
                              sangrias,
                              pagamentos,
                            }}
                          />
                          <DeleteButton
                            action={deleteCashClosing.bind(null, closing.id)}
                            title={`Excluir fechamento de ${formatDate(closing.date)}?`}
                            description="A transação de entrada gerada por esse fechamento também será excluída."
                          />
                        </>
                      }
                    />
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  const companyIds = await resolveCompanyIds(scope);
  const closings =
    companyIds.length === 0
      ? []
      : await prisma.cashClosing.findMany({
          where: { companyId: { in: companyIds } },
          include: { lines: true, company: true, account: true },
          orderBy: [{ company: { name: "asc" } }, { date: "desc" }],
        });

  // Resume por empresa (uma linha por empresa, não uma por fechamento) —
  // evita poluir a tela conforme o histórico de fechamentos cresce.
  interface CompanySummary {
    companyId: string;
    companyName: string;
    count: number;
    withDifference: number;
    lastDate: Date;
  }
  const summaries: CompanySummary[] = [];
  for (const closing of closings) {
    const totalSangrias = toLines(closing.lines, "SANGRIA").reduce((s, l) => s + l.amount, 0);
    const totalPagamentos = toLines(closing.lines, "PAGAMENTO").reduce((s, l) => s + l.amount, 0);
    const diferenca = Number(closing.countedCash) - (totalSangrias - totalPagamentos);

    let summary = summaries.find((s) => s.companyId === closing.companyId);
    if (!summary) {
      summary = {
        companyId: closing.companyId,
        companyName: closing.company.name,
        count: 0,
        withDifference: 0,
        lastDate: closing.date,
      };
      summaries.push(summary);
    }
    summary.count += 1;
    if (Math.abs(diferenca) >= 0.005) summary.withDifference += 1;
    if (closing.date > summary.lastDate) summary.lastDate = closing.date;
  }
  summaries.sort((a, b) => a.companyName.localeCompare(b.companyName));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fechamento de Caixa</h1>
        <p className="text-muted-foreground text-sm">
          Resumo por empresa — {scopeLabel}. Para ver os fechamentos de uma unidade, cadastrar, editar ou
          excluir, use &quot;Ver detalhes&quot; ou o menu à esquerda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{summaries.length} empresa(s) com fechamento cadastrado</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Fechamentos</TableHead>
                <TableHead className="text-right">Com diferença</TableHead>
                <TableHead>Último fechamento</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum fechamento nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {summaries.map((s) => (
                <TableRow key={s.companyId}>
                  <TableCell className="font-medium">{s.companyName}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.withDifference > 0 ? (
                      <span className="text-destructive">{s.withDifference}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(s.lastDate)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <SwitchToCompanyButton companyId={s.companyId} />
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
