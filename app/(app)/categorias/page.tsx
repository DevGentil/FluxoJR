import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CategoryFormDialog } from "./category-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteCategory } from "./actions";

async function ConsolidatedCategories({ companyIds, scopeLabel }: { companyIds: string[]; scopeLabel: string }) {
  const categories =
    companyIds.length === 0
      ? []
      : await prisma.category.findMany({
          where: { companyId: { in: companyIds } },
          include: { company: true },
          orderBy: { name: "asc" },
        });

  const companyCount = new Set(categories.map((c) => c.companyId)).size;

  // Agrupa por nome+tipo (ex: "Mercado Pago"/INCOME), já que a mesma categoria
  // é um registro separado por empresa — evita listar a mesma categoria uma
  // vez por unidade e mostra só quem usa cada uma.
  const grouped = new Map<
    string,
    { name: string; type: "INCOME" | "EXPENSE"; costCenters: Set<string>; companies: Set<string> }
  >();
  for (const category of categories) {
    const key = `${category.name}__${category.type}`;
    const entry = grouped.get(key) ?? {
      name: category.name,
      type: category.type as "INCOME" | "EXPENSE",
      costCenters: new Set<string>(),
      companies: new Set<string>(),
    };
    if (category.costCenter) entry.costCenters.add(category.costCenter);
    entry.companies.add(category.company.name);
    grouped.set(key, entry);
  }
  // Entradas primeiro, depois saídas; dentro de cada tipo, ordem alfabética.
  const rows = Array.from(grouped.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "INCOME" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Categorias</h1>
        <p className="text-muted-foreground text-sm">
          Visão consolidada de todas as categorias — {scopeLabel}. Somente leitura; para cadastrar, editar
          ou excluir uma categoria, selecione uma empresa específica no menu à esquerda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} categoria(s) distintas em {companyCount} empresa(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead>Usada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma categoria cadastrada nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={`${row.name}__${row.type}`}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant={row.type === "INCOME" ? "default" : "secondary"}>
                      {row.type === "INCOME" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.costCenters.size === 0
                      ? "—"
                      : row.costCenters.size === 1
                        ? Array.from(row.costCenters)[0]
                        : "Varia por empresa"}
                  </TableCell>
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

export default async function CategoriasPage() {
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedCategories companyIds={companyIds} scopeLabel={scopeLabel} />;
  }

  const categories = await prisma.category.findMany({
    where: { companyId: scope.companyId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categorias</h1>
          <p className="text-muted-foreground text-sm">Categorize entradas e saídas por centro de custo.</p>
        </div>
        <CategoryFormDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Categorias cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma categoria cadastrada ainda.
                  </TableCell>
                </TableRow>
              )}
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Badge variant={category.type === "INCOME" ? "default" : "secondary"}>
                      {category.type === "INCOME" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell>{category.costCenter || "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <CategoryFormDialog
                        category={{
                          ...category,
                          type: category.type as "INCOME" | "EXPENSE",
                        }}
                      />
                      <DeleteButton
                        action={deleteCategory.bind(null, category.id)}
                        title={`Excluir "${category.name}"?`}
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
