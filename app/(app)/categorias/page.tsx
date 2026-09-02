import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds, getScopeLabel } from "@/lib/scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CategoryFormDialog } from "./category-form-dialog";
import { FiltrosTabela } from "@/components/filtros-tabela";
import { Pagination } from "@/components/pagination";
import { POR_PAGINA, lerPagina } from "@/lib/paginacao";
import type { Prisma } from "@/lib/generated/prisma/client";
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

interface Props {
  searchParams: Promise<{ q?: string; tipo?: string; centro?: string; page?: string }>;
}

export default async function CategoriasPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await getActiveScope();
  if (scope.type !== "company") {
    const [companyIds, scopeLabel] = await Promise.all([resolveCompanyIds(scope), getScopeLabel(scope)]);
    return <ConsolidatedCategories companyIds={companyIds} scopeLabel={scopeLabel} />;
  }

  const where: Prisma.CategoryWhereInput = { companyId: scope.companyId };
  if (params.q) where.name = { contains: params.q, mode: "insensitive" };
  if (params.tipo === "INCOME" || params.tipo === "EXPENSE") where.type = params.tipo;
  // "Sem centro de custo" e um filtro util de verdade: e assim que se acha
  // o que ficou pela metade no cadastro.
  if (params.centro === "__sem__") where.costCenter = null;
  else if (params.centro) where.costCenter = params.centro;

  const page = lerPagina(params.page);

  // O total vem de uma contagem no banco, não do tamanho da página: o título
  // dizia "N categoria(s)" e passaria a dizer 30 em qualquer cadastro maior
  // que isso — um número que descreve o corte, não o cadastro.
  const [total, categories, centros] = await Promise.all([
    prisma.category.count({ where }),
    prisma.category.findMany({
      where,
      orderBy: [{ type: "asc" }, { name: "asc" }],
      skip: (page - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.category.findMany({
      where: { companyId: scope.companyId, costCenter: { not: null } },
      select: { costCenter: true },
      distinct: ["costCenter"],
      orderBy: { costCenter: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categorias</h1>
          <p className="text-muted-foreground text-sm">Categorize entradas e saídas por centro de custo.</p>
        </div>
        <CategoryFormDialog />
      </div>

      <FiltrosTabela
        basePath="/categorias"
        valores={params as Record<string, string | undefined>}
        campos={[
          { tipo: "busca", name: "q", label: "Nome", placeholder: "Buscar..." },
          {
            tipo: "select",
            name: "tipo",
            label: "Tipo",
            vazio: "Todos",
            opcoes: [
              { value: "INCOME", label: "Entrada" },
              { value: "EXPENSE", label: "Saída" },
            ],
          },
          {
            tipo: "select",
            name: "centro",
            label: "Centro de custo",
            vazio: "Todos",
            opcoes: [
              { value: "__sem__", label: "Sem centro de custo" },
              ...centros.map((c) => ({ value: c.costCenter as string, label: c.costCenter as string })),
            ],
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{total} categoria(s)</CardTitle>
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
          <Pagination
            total={total}
            page={page}
            pageSize={POR_PAGINA}
            basePath="/categorias"
            params={params}
            rotulo="categorias"
          />
        </CardContent>
      </Card>
    </div>
  );
}
