import { prisma } from "@/lib/prisma";
import { getActiveScope, getScopeLabel } from "@/lib/scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GroupFormDialog } from "./group-form-dialog";
import { CompanyFormDialog } from "./company-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteGroup, deleteCompany } from "./actions";

export default async function EmpresasPage() {
  const scope = await getActiveScope();
  const scopeLabel = await getScopeLabel(scope);

  // O que é listado nas tabelas depende do escopo ativo: uma empresa
  // específica mostra só ela mesma (e o grupo dela, se tiver); um grupo
  // consolidado mostra só as unidades daquele grupo; a holding mostra tudo.
  const [displayGroups, displayCompanies, allGroups] = await Promise.all([
    scope.type === "all"
      ? prisma.group.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { companies: true } } } })
      : scope.type === "group"
        ? prisma.group.findMany({
            where: { id: scope.groupId },
            include: { _count: { select: { companies: true } } },
          })
        : prisma.group.findMany({
            where: { companies: { some: { id: scope.companyId } } },
            include: { _count: { select: { companies: true } } },
          }),
    scope.type === "all"
      ? prisma.company.findMany({ orderBy: { name: "asc" }, include: { group: true } })
      : scope.type === "group"
        ? prisma.company.findMany({
            where: { groupId: scope.groupId },
            orderBy: { name: "asc" },
            include: { group: true },
          })
        : prisma.company.findMany({ where: { id: scope.companyId }, include: { group: true } }),
    // O seletor de grupo dos diálogos de criar/editar empresa sempre lista
    // todos os grupos, independente do escopo em exibição.
    prisma.group.findMany({ orderBy: { name: "asc" } }),
  ]);

  const groupOptions = allGroups.map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <p className="text-muted-foreground text-sm">
          Cadastre as empresas/unidades da holding e, opcionalmente, agrupe-as por marca/franquia —{" "}
          {scopeLabel}.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Grupos / marcas</CardTitle>
          <GroupFormDialog />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    {scope.type === "company"
                      ? "Essa empresa não pertence a nenhum grupo."
                      : "Nenhum grupo cadastrado. Grupos são opcionais — só use se tiver várias empresas sob a mesma marca/franquia."}
                  </TableCell>
                </TableRow>
              )}
              {displayGroups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{group._count.companies}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <GroupFormDialog group={group} />
                      <DeleteButton
                        action={deleteGroup.bind(null, group.id)}
                        title={`Excluir grupo "${group.name}"?`}
                        description="As empresas desse grupo não são excluídas, só ficam sem grupo."
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Empresas</CardTitle>
          <CompanyFormDialog groups={groupOptions} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayCompanies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma empresa cadastrada ainda.
                  </TableCell>
                </TableRow>
              )}
              {displayCompanies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell>{company.cnpj || "—"}</TableCell>
                  <TableCell>
                    {company.group ? <Badge variant="outline">{company.group.name}</Badge> : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <CompanyFormDialog
                        groups={groupOptions}
                        company={{
                          id: company.id,
                          name: company.name,
                          cnpj: company.cnpj,
                          groupId: company.groupId,
                        }}
                      />
                      <DeleteButton
                        action={deleteCompany.bind(null, company.id)}
                        title={`Excluir "${company.name}"?`}
                        description="Isso apaga TODAS as contas, transações, categorias e lançamentos dessa empresa. Não pode ser desfeito."
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
