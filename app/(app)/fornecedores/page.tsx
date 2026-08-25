import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteSupplier } from "./actions";

async function ConsolidatedSuppliers({ companyIds, scopeLabel }: { companyIds: string[]; scopeLabel: string }) {
  const suppliers =
    companyIds.length === 0
      ? []
      : await prisma.supplier.findMany({
          where: { companyId: { in: companyIds } },
          include: { company: true },
          orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
        });

  const companyCount = new Set(suppliers.map((s) => s.companyId)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fornecedores</h1>
        <p className="text-muted-foreground text-sm">
          Visão consolidada de todos os fornecedores — {scopeLabel}. Somente leitura; para cadastrar, editar
          ou excluir um fornecedor, selecione uma empresa específica no menu à esquerda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {suppliers.length} fornecedor(es) em {companyCount} empresa(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum fornecedor cadastrado nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.company.name}</TableCell>
                  <TableCell>{supplier.name}</TableCell>
                  <TableCell>{supplier.document || "—"}</TableCell>
                  <TableCell>{supplier.phone || "—"}</TableCell>
                  <TableCell>{supplier.email || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function FornecedoresPage() {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedSuppliers companyIds={companyIds} scopeLabel={scopeLabel} />;
  }

  const suppliers = await prisma.supplier.findMany({
    where: { companyId: scope.companyId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fornecedores</h1>
          <p className="text-muted-foreground text-sm">
            Fornecedores e clientes para vincular a transações e contas a pagar/receber.
          </p>
        </div>
        <SupplierFormDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fornecedores cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum fornecedor cadastrado ainda.
                  </TableCell>
                </TableRow>
              )}
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell>{supplier.document || "—"}</TableCell>
                  <TableCell>{supplier.phone || "—"}</TableCell>
                  <TableCell>{supplier.email || "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <SupplierFormDialog supplier={supplier} />
                      <DeleteButton
                        action={deleteSupplier.bind(null, supplier.id)}
                        title={`Excluir "${supplier.name}"?`}
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
