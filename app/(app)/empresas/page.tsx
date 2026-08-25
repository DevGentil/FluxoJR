import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GroupFormDialog } from "./group-form-dialog";
import { CompanyFormDialog } from "./company-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteGroup, deleteCompany } from "./actions";

export default async function EmpresasPage() {
  const [groups, companies] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    prisma.company.findMany({ orderBy: { name: "asc" }, include: { group: true } }),
  ]);

  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <p className="text-muted-foreground text-sm">
          Cadastre as empresas/unidades da holding e, opcionalmente, agrupe-as por marca/franquia.
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
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Nenhum grupo cadastrado. Grupos são opcionais — só use se tiver várias
                    empresas sob a mesma marca/franquia.
                  </TableCell>
                </TableRow>
              )}
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{companies.filter((c) => c.groupId === group.id).length}</TableCell>
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
              {companies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma empresa cadastrada ainda.
                  </TableCell>
                </TableRow>
              )}
              {companies.map((company) => (
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
