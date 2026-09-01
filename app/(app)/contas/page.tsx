import { prisma } from "@/lib/prisma";
import { contaAtual } from "@/lib/access";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/kpi-card";
import { DeleteButton } from "@/components/delete-button";
import { ShieldCheck, Users, Building2, KeyRound } from "lucide-react";
import { ContaFormDialog } from "./conta-form-dialog";
import { SenhaDialog } from "./senha-dialog";
import { desativarConta } from "./actions";

/** Contas de acesso ao sistema.
 *
 * Quem enxerga esta tela: holding e gestor. O gestor só vê as contas das
 * unidades em que ele é gestor — listar uma conta que ele não pode editar
 * só produziria um erro depois do clique. */
export default async function ContasPage() {
  const conta = await contaAtual();
  if (!conta) return null;

  const unidadesQueAdministra = conta.holding
    ? null
    : [...conta.papeis.entries()].filter(([, p]) => p === "GESTOR").map(([id]) => id);

  if (unidadesQueAdministra?.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Contas de Acesso</h1>
        <p className="text-muted-foreground text-sm">
          Sua conta não gerencia acessos. Fale com o gestor da sua unidade ou com a holding.
        </p>
      </div>
    );
  }

  const [contas, empresas] = await Promise.all([
    prisma.appUser.findMany({
      where: unidadesQueAdministra
        ? { holding: false, access: { some: { companyId: { in: unidadesQueAdministra } } } }
        : {},
      include: {
        access: { include: { company: { select: { id: true, name: true } } } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.company.findMany({
      where: unidadesQueAdministra ? { id: { in: unidadesQueAdministra } } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const ativas = contas.filter((c) => c.active).length;
  const pendentes = contas.filter((c) => c.active && c.senhaProvisoria).length;

  const empresaOptions = empresas.map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas de Acesso</h1>
        <p className="text-muted-foreground text-sm">
          Quem entra no sistema, com qual função e em qual unidade. O que cada função enxerga está
          fixado no sistema e é igual para todas as unidades.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Contas ativas" value={String(ativas)} icon={Users} iconClass="text-sky-500" />
        <KpiCard
          label="Unidades que você administra"
          value={conta.holding ? "Todas" : String(empresas.length)}
          icon={Building2}
          iconClass="text-violet-500"
        />
        <KpiCard
          label="Aguardando primeiro acesso"
          value={String(pendentes)}
          hint={pendentes > 0 ? "Ainda usam a senha que você definiu" : "Todas com senha própria"}
          icon={KeyRound}
          iconClass={pendentes > 0 ? "text-amber-500" : "text-muted-foreground"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{contas.length} conta(s)</CardTitle>
            <CardDescription>
              Contas desativadas não entram no sistema, mas ficam na lista para preservar o registro de
              quem criou o quê.
            </CardDescription>
          </div>
          <ContaFormDialog empresas={empresaOptions} podeHolding={conta.holding} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Criada por</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma conta cadastrada ainda além da sua.
                  </TableCell>
                </TableRow>
              )}
              {contas.map((c) => (
                <TableRow key={c.id} className={c.active ? undefined : "opacity-55"}>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.holding ? (
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="size-4 text-amber-500 shrink-0" />
                        <span className="font-medium">Holding</span>
                        <span className="text-muted-foreground">· todas as unidades</span>
                      </span>
                    ) : (
                      <div className="space-y-0.5">
                        {c.access.map((a) => (
                          <div key={a.id}>
                            <span className="font-medium">{ROLE_LABELS[a.role as Role]}</span>
                            <span className="text-muted-foreground"> · {a.company.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {!c.active ? (
                      <Badge variant="outline">Desativada</Badge>
                    ) : c.senhaProvisoria ? (
                      <Badge variant="outline" className="text-amber-600 dark:text-amber-500">
                        Senha provisória
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Ativa</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.createdBy?.name ?? "—"}
                    <span className="block text-xs">{formatDate(c.createdAt)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <ContaFormDialog
                        empresas={empresaOptions}
                        podeHolding={conta.holding}
                        conta={{
                          id: c.id,
                          name: c.name,
                          email: c.email,
                          active: c.active,
                          holding: c.holding,
                          acessos: c.access.map((a) => ({
                            companyId: a.companyId,
                            role: a.role as Role,
                          })),
                        }}
                      />
                      <SenhaDialog contaId={c.id} nome={c.name} />
                      {c.active && c.id !== conta.id && (
                        <DeleteButton
                          action={desativarConta.bind(null, c.id)}
                          title={`Desativar o acesso de ${c.name}?`}
                          description="A pessoa deixa de entrar no sistema imediatamente. A conta continua na lista, e o acesso pode ser devolvido depois."
                          confirmLabel="Desativar"
                        />
                      )}
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
