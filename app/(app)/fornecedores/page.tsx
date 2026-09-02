import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { FiltrosTabela } from "@/components/filtros-tabela";
import type { Prisma } from "@/lib/generated/prisma/client";
import { DeleteButton } from "@/components/delete-button";
import { deleteSupplier } from "./actions";

function summarizeField(values: Set<string>): string {
  if (values.size === 0) return "—";
  if (values.size === 1) return Array.from(values)[0];
  return "Varia por empresa";
}

async function ConsolidatedSuppliers({ companyIds, scopeLabel }: { companyIds: string[]; scopeLabel: string }) {
  const suppliers =
    companyIds.length === 0
      ? []
      : await prisma.supplier.findMany({
          where: { companyId: { in: companyIds } },
          include: { company: true },
          orderBy: { name: "asc" },
        });

  const companyCount = new Set(suppliers.map((s) => s.companyId)).size;

  // Agrupa por nome, já que o mesmo fornecedor é um registro separado por
  // empresa — evita repetir a mesma linha várias vezes num escopo com muitas
  // unidades e mostra só quais empresas usam cada fornecedor.
  const grouped = new Map<
    string,
    { name: string; documents: Set<string>; phones: Set<string>; emails: Set<string>; companies: Set<string> }
  >();
  for (const supplier of suppliers) {
    const entry = grouped.get(supplier.name) ?? {
      name: supplier.name,
      documents: new Set<string>(),
      phones: new Set<string>(),
      emails: new Set<string>(),
      companies: new Set<string>(),
    };
    if (supplier.document) entry.documents.add(supplier.document);
    if (supplier.phone) entry.phones.add(supplier.phone);
    if (supplier.email) entry.emails.add(supplier.email);
    entry.companies.add(supplier.company.name);
    grouped.set(supplier.name, entry);
  }
  const rows = Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));

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
            {rows.length} fornecedor(es) distintos em {companyCount} empresa(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Usado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum fornecedor cadastrado nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{summarizeField(row.documents)}</TableCell>
                  <TableCell>{summarizeField(row.phones)}</TableCell>
                  <TableCell>{summarizeField(row.emails)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {Array.from(row.companies).sort().join(", ")}
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

interface Props {
  searchParams: Promise<{ q?: string; doc?: string; contato?: string }>;
}

export default async function FornecedoresPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedSuppliers companyIds={companyIds} scopeLabel={scopeLabel} />;
  }

  const where: Prisma.SupplierWhereInput = { companyId: scope.companyId };
  // Uma busca so, atravessando nome, documento, telefone e e-mail: quem
  // procura fornecedor tem na mao um pedaco de QUALQUER um deles, e obrigar
  // a escolher a coluna certa antes de digitar e trabalho a toa.
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { document: { contains: params.q, mode: "insensitive" } },
      { phone: { contains: params.q, mode: "insensitive" } },
      { email: { contains: params.q, mode: "insensitive" } },
    ];
  }
  // Os dois abaixo acham o cadastro pela metade — o que trava a emissao de
  // nota ou o contato na hora da cobranca.
  if (params.doc === "__sem__") where.document = null;
  if (params.contato === "__sem__") where.AND = [{ phone: null }, { email: null }];

  const suppliers = await prisma.supplier.findMany({ where, orderBy: { name: "asc" } });

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

      <FiltrosTabela
        basePath="/fornecedores"
        valores={params as Record<string, string | undefined>}
        campos={[
          { tipo: "busca", name: "q", label: "Buscar", placeholder: "Nome, CNPJ, telefone..." },
          {
            tipo: "select",
            name: "doc",
            label: "Documento",
            vazio: "Todos",
            opcoes: [{ value: "__sem__", label: "Sem CNPJ/CPF" }],
          },
          {
            tipo: "select",
            name: "contato",
            label: "Contato",
            vazio: "Todos",
            opcoes: [{ value: "__sem__", label: "Sem telefone nem e-mail" }],
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{suppliers.length} fornecedor(es)</CardTitle>
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
