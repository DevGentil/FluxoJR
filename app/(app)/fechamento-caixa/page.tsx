import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
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

  const groups: { companyName: string; closings: typeof closings }[] = [];
  for (const closing of closings) {
    const last = groups[groups.length - 1];
    if (last && last.companyName === closing.company.name) last.closings.push(closing);
    else groups.push({ companyName: closing.company.name, closings: [closing] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fechamento de Caixa</h1>
        <p className="text-muted-foreground text-sm">
          Visão consolidada de todos os fechamentos — {scopeLabel}. Somente leitura; para cadastrar, editar
          ou excluir um fechamento, selecione uma empresa específica no menu à esquerda.
        </p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="text-center text-muted-foreground py-8">
            Nenhum fechamento nesse escopo.
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.companyName}>
            <CardHeader>
              <CardTitle>
                {group.companyName} — {group.closings.length} fechamento(s)
              </CardTitle>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.closings.map((closing) => {
                    const rowData: CashClosingRowData = {
                      id: closing.id,
                      date: closing.date,
                      accountName: closing.account.name,
                      companyName: closing.company.name,
                      countedCash: Number(closing.countedCash),
                      notes: closing.notes,
                      sangrias: toLines(closing.lines, "SANGRIA"),
                      pagamentos: toLines(closing.lines, "PAGAMENTO"),
                    };
                    return <CashClosingRow key={closing.id} closing={rowData} />;
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
