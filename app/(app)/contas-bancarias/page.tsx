import { Fragment } from "react";
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
  const companyCount = new Set(accounts.map((a) => a.companyId)).size;

  // Agrupa por empresa (já vem ordenado por nome da empresa) — todo o bloco
  // de uma unidade, depois o da próxima, com subtotal por empresa.
  const groups: { companyName: string; accounts: { account: (typeof accounts)[number]; balance: number }[] }[] = [];
  accounts.forEach((account, i) => {
    const balance = balances[i];
    const last = groups[groups.length - 1];
    if (last && last.companyName === account.company.name) {
      last.accounts.push({ account, balance });
    } else {
      groups.push({ companyName: account.company.name, accounts: [{ account, balance }] });
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas Bancárias</h1>
        <p className="text-muted-foreground text-sm">
          Visão consolidada de todas as contas — {scopeLabel}. Somente leitura; para cadastrar, editar ou
          excluir uma conta, selecione uma empresa específica no menu à esquerda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {accounts.length} conta(s) em {companyCount} empresa(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Saldo atual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma conta cadastrada nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {groups.map((group) => {
                const groupTotal = group.accounts.reduce((sum, a) => sum + a.balance, 0);
                return (
                  <Fragment key={group.companyName}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={4} className="font-semibold">
                        {group.companyName}
                      </TableCell>
                    </TableRow>
                    {group.accounts.map(({ account, balance }) => (
                      <TableRow key={account.id}>
                        <TableCell>{account.name}</TableCell>
                        <TableCell>{account.bank || "—"}</TableCell>
                        <TableCell>{account.type}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground text-sm">
                        Subtotal {group.companyName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground text-sm">
                        {formatCurrency(groupTotal)}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
            {accounts.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total consolidado</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(totalBalance)}</TableCell>
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
                <TableHead>Banco</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Saldo atual</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma conta cadastrada ainda.
                  </TableCell>
                </TableRow>
              )}
              {accounts.map((account, i) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>{account.bank || "—"}</TableCell>
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
