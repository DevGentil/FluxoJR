import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveScope, getScopeLabel, resolveCompanyIds } from "@/lib/scope";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GroupFormDialog } from "./group-form-dialog";
import { CompanyFormDialog } from "./company-form-dialog";
import { DocumentFormDialog } from "./document-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deleteGroup, deleteCompany } from "./actions";
import { deleteDocument } from "./documents-actions";
import { Download } from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function DocumentsSection({ scope }: { scope: Awaited<ReturnType<typeof getActiveScope>> }) {
  if (scope.type === "company") {
    const documents = await prisma.document.findMany({
      where: { companyId: scope.companyId },
      orderBy: { createdAt: "desc" },
    });

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Documentos</CardTitle>
          <DocumentFormDialog />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum documento enviado ainda.
                  </TableCell>
                </TableRow>
              )}
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.fileName}</TableCell>
                  <TableCell className="max-w-80 truncate">{doc.description}</TableCell>
                  <TableCell>{formatBytes(doc.size)}</TableCell>
                  <TableCell>{formatDate(doc.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        nativeButton={false}
                        render={<a href={`/api/documents/${doc.id}`} />}
                      >
                        <Download className="size-4" />
                      </Button>
                      <DeleteButton
                        action={deleteDocument.bind(null, doc.id)}
                        title={`Excluir "${doc.fileName}"?`}
                      />
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

  const companyIds = await resolveCompanyIds(scope);
  const documents =
    companyIds.length === 0
      ? []
      : await prisma.document.findMany({
          where: { companyId: { in: companyIds } },
          include: { company: true },
          orderBy: [{ company: { name: "asc" } }, { createdAt: "desc" }],
        });

  const groups: { companyName: string; documents: typeof documents }[] = [];
  for (const doc of documents) {
    const last = groups[groups.length - 1];
    if (last && last.companyName === doc.company.name) last.documents.push(doc);
    else groups.push({ companyName: doc.company.name, documents: [doc] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Arquivo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Enviado em</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum documento nesse escopo.
                </TableCell>
              </TableRow>
            )}
            {groups.map((group) => (
              <Fragment key={group.companyName}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={5} className="font-semibold">
                    {group.companyName}
                  </TableCell>
                </TableRow>
                {group.documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.fileName}</TableCell>
                    <TableCell className="max-w-80 truncate">{doc.description}</TableCell>
                    <TableCell>{formatBytes(doc.size)}</TableCell>
                    <TableCell>{formatDate(doc.createdAt)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        nativeButton={false}
                        render={<a href={`/api/documents/${doc.id}`} />}
                      >
                        <Download className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

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
  // Uma unidade específica só pode ver os próprios dados — criar, editar ou
  // excluir grupos/empresas exige a visão consolidada (grupo ou holding).
  const canManage = scope.type !== "company";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <p className="text-muted-foreground text-sm">
          {canManage
            ? "Cadastre as empresas/unidades da holding e, opcionalmente, agrupe-as por marca/franquia — "
            : "Dados da empresa ativa. Selecione a visão consolidada (grupo ou holding) no menu à esquerda para gerenciar grupos/empresas — "}
          {scopeLabel}.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Grupos / marcas</CardTitle>
          {canManage && <GroupFormDialog />}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresas</TableHead>
                {canManage && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 3 : 2} className="text-center text-muted-foreground py-8">
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
                  {canManage && (
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
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Empresas</CardTitle>
          {canManage && <CompanyFormDialog groups={groupOptions} />}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Grupo</TableHead>
                {canManage && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayCompanies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground py-8">
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
                  {canManage && (
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
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DocumentsSection scope={scope} />
    </div>
  );
}
