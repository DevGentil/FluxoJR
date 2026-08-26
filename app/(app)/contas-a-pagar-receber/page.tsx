import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduledFormDialog } from "./scheduled-form-dialog";
import { MarkPaidDialog } from "./mark-paid-dialog";
import { ImportDialog } from "./import-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteScheduledEntry } from "./actions";

function statusBadge(status: string, dueDate: Date) {
  const effective = status === "PENDING" && dueDate < new Date() ? "OVERDUE" : status;
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    PENDING: { label: "Pendente", variant: "secondary" },
    OVERDUE: { label: "Atrasado", variant: "destructive" },
    PAID: { label: "Pago", variant: "default" },
    CANCELED: { label: "Cancelado", variant: "outline" },
  };
  const { label, variant } = map[effective] ?? map.PENDING;
  return <Badge variant={variant}>{label}</Badge>;
}

async function EntriesTable({ companyId, type }: { companyId: string; type: "PAYABLE" | "RECEIVABLE" }) {
  const [entries, accounts, categories, suppliers] = await Promise.all([
    prisma.scheduledEntry.findMany({
      where: { companyId, type },
      include: { account: true, category: true, supplier: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.account.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
  ]);

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, type: c.type as "INCOME" | "EXPENSE" }));
  const supplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{entries.length} lançamentos</CardTitle>
        <ScheduledFormDialog
          accounts={accountOptions}
          categories={categoryOptions}
          suppliers={supplierOptions}
          defaultType={type}
        />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimento</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-72" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum lançamento cadastrado ainda.
                </TableCell>
              </TableRow>
            )}
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatDate(entry.dueDate)}</TableCell>
                <TableCell className="max-w-64 truncate">{entry.description}</TableCell>
                <TableCell>{entry.category?.name ?? "—"}</TableCell>
                <TableCell>{entry.supplier?.name ?? "—"}</TableCell>
                <TableCell>{statusBadge(entry.status, entry.dueDate)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(Number(entry.amount))}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {entry.status === "PENDING" && (
                      <MarkPaidDialog
                        entryId={entry.id}
                        type={type}
                        accounts={accountOptions}
                        defaultAccountId={entry.accountId}
                      />
                    )}
                    <ScheduledFormDialog
                      accounts={accountOptions}
                      categories={categoryOptions}
                      suppliers={supplierOptions}
                      defaultType={type}
                      entry={{
                        id: entry.id,
                        type: entry.type as "PAYABLE" | "RECEIVABLE",
                        description: entry.description,
                        amount: Number(entry.amount),
                        dueDate: entry.dueDate,
                        accountId: entry.accountId,
                        categoryId: entry.categoryId,
                        supplierId: entry.supplierId,
                      }}
                    />
                    <DeleteButton action={deleteScheduledEntry.bind(null, entry.id)} title="Excluir lançamento?" />
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

async function ConsolidatedEntriesTable({
  companyIds,
  type,
}: {
  companyIds: string[];
  type: "PAYABLE" | "RECEIVABLE";
}) {
  const entries =
    companyIds.length === 0
      ? []
      : await prisma.scheduledEntry.findMany({
          where: { companyId: { in: companyIds }, type },
          include: { company: true, category: true, supplier: true },
          orderBy: [{ company: { name: "asc" } }, { dueDate: "asc" }],
        });

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="text-center text-muted-foreground py-8">
          Nenhum lançamento nesse escopo.
        </CardContent>
      </Card>
    );
  }

  const groups: { companyName: string; entries: typeof entries }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.companyName === entry.company.name) {
      last.entries.push(entry);
    } else {
      groups.push({ companyName: entry.company.name, entries: [entry] });
    }
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.companyName}>
          <CardHeader>
            <CardTitle>
              {group.companyName} — {group.entries.length} lançamento(s)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.dueDate)}</TableCell>
                    <TableCell className="max-w-64 truncate">{entry.description}</TableCell>
                    <TableCell>{entry.category?.name ?? "—"}</TableCell>
                    <TableCell>{entry.supplier?.name ?? "—"}</TableCell>
                    <TableCell>{statusBadge(entry.status, entry.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(Number(entry.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function ConsolidatedEntries({ companyIds, scopeLabel }: { companyIds: string[]; scopeLabel: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas a Pagar e a Receber</h1>
        <p className="text-muted-foreground text-sm">
          Visão consolidada de todos os lançamentos previstos — {scopeLabel}. Somente leitura; para
          cadastrar, editar, excluir ou dar baixa num lançamento, selecione uma empresa específica no menu
          à esquerda.
        </p>
      </div>

      <Tabs defaultValue="payable">
        <TabsList>
          <TabsTrigger value="payable">A Pagar</TabsTrigger>
          <TabsTrigger value="receivable">A Receber</TabsTrigger>
        </TabsList>
        <TabsContent value="payable" className="mt-4">
          <ConsolidatedEntriesTable companyIds={companyIds} type="PAYABLE" />
        </TabsContent>
        <TabsContent value="receivable" className="mt-4">
          <ConsolidatedEntriesTable companyIds={companyIds} type="RECEIVABLE" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default async function ContasAPagarReceberPage() {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedEntries companyIds={companyIds} scopeLabel={scopeLabel} />;
  }
  const companyId = scope.companyId;

  const [accounts, categories, suppliers] = await Promise.all([
    prisma.account.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
  ]);
  const importAccountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const importCategoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const importSupplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Contas a Pagar e a Receber</h1>
          <p className="text-muted-foreground text-sm">Previsão de entradas e saídas futuras.</p>
        </div>
        <ImportDialog accounts={importAccountOptions} categories={importCategoryOptions} suppliers={importSupplierOptions} />
      </div>

      <Tabs defaultValue="payable">
        <TabsList>
          <TabsTrigger value="payable">A Pagar</TabsTrigger>
          <TabsTrigger value="receivable">A Receber</TabsTrigger>
        </TabsList>
        <TabsContent value="payable" className="mt-4">
          <EntriesTable companyId={companyId} type="PAYABLE" />
        </TabsContent>
        <TabsContent value="receivable" className="mt-4">
          <EntriesTable companyId={companyId} type="RECEIVABLE" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
