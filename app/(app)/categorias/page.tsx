import { prisma } from "@/lib/prisma";
import { getDefaultCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CategoryFormDialog } from "./category-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteCategory } from "./actions";

export default async function CategoriasPage() {
  const company = await getDefaultCompany();
  const categories = await prisma.category.findMany({
    where: { companyId: company.id },
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
