import { prisma } from "@/lib/prisma";
import { getActiveScope } from "@/lib/scope";
import { SelectCompanyNotice } from "@/components/select-company-notice";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountFormDialog } from "./account-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteAccount } from "./actions";

export default async function ContasBancariasPage() {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    return <SelectCompanyNotice what="gerenciar contas bancárias" />;
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
