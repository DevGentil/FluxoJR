import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { getAccountBalance } from "@/lib/cashflow";
import { formatCurrency } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountFormDialog } from "./account-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { SwitchToCompanyButton } from "@/components/switch-to-company-button";
import { deleteAccount } from "./actions";

async function ConsolidatedAccounts({ companyIds, scopeLabel }: { companyIds: string[]; scopeLabel: string }) {
  const accounts =
    companyIds.length === 0
      ? []
      : await prisma.account.findMany({
          where: { companyId: { in: companyIds } },
          include: { company: true },
          orderBy: [{ company: { name: "asc" } }, { createdAt: "asc" }],
        });

  const balances = await Promise.all(accounts.map((a) => getAccountBalance(a.id)));
  const totalBalance = balances.reduce((sum, b) => sum + b, 0);

  // Resume por empresa (uma linha por empresa, não uma por conta) — evita
  // poluir a tela conforme o número de empresas/contas cresce.
  interface CompanySummary {
    companyId: string;
    companyName: string;
    accountCount: number;
    balance: number;
  }
  const summaries: CompanySummary[] = [];
  accounts.forEach((account, i) => {
    let summary = summaries.find((s) => s.companyId === account.companyId);
    if (!summary) {
      summary = { companyId: account.companyId, companyName: account.company.name, accountCount: 0, balance: 0 };
      summaries.push(summary);
    }
    summary.accountCount += 1;
    summary.balance += balances[i];
  });
  summaries.sort((a, b) => a.companyName.localeCompare(b.companyName));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas Bancárias</h1>
        <p className="text-muted-foreground text-sm">
          Resumo por empresa — {scopeLabel}. Para ver as contas de uma unidade, use &quot;Ver detalhes&quot;
          ou o menu à esquerda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {accounts.length} conta(s) em {summaries.length} empresa(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Contas</TableHead>
                <TableHead className="text-right">Saldo atual</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma conta cadastrada nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {summaries.map((s) => (
                <TableRow key={s.companyId}>
                  <TableCell className="font-medium">{s.companyName}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.accountCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(s.balance)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <SwitchToCompanyButton companyId={s.companyId} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {summaries.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total consolidado</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(totalBalance)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function ContasBancariasPage() {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedAccounts companyIds={companyIds} scopeLabel={scopeLabel} />;
  }

  const accounts = await prisma.account.findMany({
    where: { companyId: scope.companyId },
    orderBy: { createdAt: "asc" },
  });

  const balances = await Promise.all(accounts.map((a) => getAccountBalance(a.id)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contas Bancárias</h1>
          <p className="text-muted-foreground text-sm">Contas correntes, poupança e caixa da empresa.</p>
        </div>
        <AccountFormDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contas cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Saldo atual</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma conta cadastrada ainda.
                  </TableCell>
                </TableRow>
              )}
              {accounts.map((account, i) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>{account.type}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(balances[i])}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <AccountFormDialog
                        account={{ ...account, initialBalance: Number(account.initialBalance) }}
                      />
                      <DeleteButton
                        action={deleteAccount.bind(null, account.id)}
                        title={`Excluir "${account.name}"?`}
                        description="Todas as transações vinculadas a esta conta também serão excluídas."
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
