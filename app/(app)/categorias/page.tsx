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
          orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
        });

  const companyCount = new Set(categories.map((c) => c.companyId)).size;

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
            {categories.length} categoria(s) em {companyCount} empresa(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Centro de custo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma categoria cadastrada nesse escopo.
                  </TableCell>
                </TableRow>
              )}
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.company.name}</TableCell>
                  <TableCell>{category.name}</TableCell>
                  <TableCell>
                    <Badge variant={category.type === "INCOME" ? "default" : "secondary"}>
                      {category.type === "INCOME" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell>{category.costCenter || "—"}</TableCell>
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
    orderBy: { name: "asc" },
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
