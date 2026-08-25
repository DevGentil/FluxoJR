import { prisma } from "@/lib/prisma";
import { getActiveScope } from "@/lib/scope";
import { SelectCompanyNotice } from "@/components/select-company-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteSupplier } from "./actions";

export default async function FornecedoresPage() {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    return <SelectCompanyNotice what="gerenciar fornecedores" />;
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
