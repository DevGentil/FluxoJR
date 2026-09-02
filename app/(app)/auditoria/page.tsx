import { prisma } from "@/lib/prisma";
import { contaAtual } from "@/lib/access";
import { MODULE_LABELS, type Module } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";
import { AuditoriaFiltro } from "./auditoria-filtro";
import type { Prisma } from "@/lib/generated/prisma/client";

interface Props {
  searchParams: Promise<{ page?: string; q?: string; modulo?: string; empresa?: string }>;
}

const POR_PAGINA = 40;

/** Quem cor o verbo carrega. Excluir e pagar são o que se procura numa
 * divergência, então saltam; criar e alterar são rotina. */
const COR_ACAO: Record<string, string> = {
  excluiu: "text-destructive",
  desativou: "text-destructive",
  pagou: "text-emerald-600 dark:text-emerald-400",
  aprovou: "text-emerald-600 dark:text-emerald-400",
  // Ambar e nao vermelho: reabrir e correcao legitima, nao estrago — mas
  // tira dinheiro do resultado, entao nao pode passar despercebido.
  reabriu: "text-amber-600 dark:text-amber-400",
};

function quando(at: Date) {
  return at.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** O histórico de quem alterou o quê.
 *
 * Holding vê tudo; gestor vê o que aconteceu nas unidades dele. O
 * operacional e o financeiro não veem — saber quem mexeu no quê é
 * atribuição de quem responde pela unidade. */
export default async function AuditoriaPage({ searchParams }: Props) {
  const conta = await contaAtual();
  if (!conta) return null;

  const unidadesQueVe = conta.holding
    ? null
    : [...conta.papeis.entries()].filter(([, p]) => p === "GESTOR").map(([id]) => id);

  if (unidadesQueVe?.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-muted-foreground text-sm">
          Esta tela é de quem responde pela unidade. Fale com o gestor ou com a holding.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const busca = (params.q ?? "").trim();

  const where: Prisma.AuditLogWhereInput = {};
  // Gestor não vê os eventos de sistema (contas de holding, por exemplo),
  // que não têm empresa: `companyId` nulo fica fora do filtro `in`.
  if (unidadesQueVe) where.companyId = { in: unidadesQueVe };
  if (params.modulo) where.module = params.modulo;
  if (params.empresa) where.companyId = params.empresa;
  if (busca) {
    where.OR = [
      { entidade: { contains: busca, mode: "insensitive" } },
      { resumo: { contains: busca, mode: "insensitive" } },
      { userName: { contains: busca, mode: "insensitive" } },
    ];
  }

  const [total, registros, empresas] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.company.findMany({
      where: unidadesQueVe ? { id: { in: unidadesQueVe } } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const modulosUsados = [...new Set(registros.map((r) => r.module))].sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-muted-foreground text-sm">
          Quem alterou o quê, e quando. Registra o que mexe em dinheiro e em acesso — não toda
          gravação, para o que importa não se perder no meio do que não importa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {total} registro(s)
            {(busca || params.modulo || params.empresa) && (
              <span className="text-muted-foreground font-normal text-sm"> com esse filtro</span>
            )}
          </CardTitle>
          <CardDescription>
            O nome de quem fez fica gravado aqui, não apontado para o cadastro — apagar a conta não
            apaga o rastro dela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuditoriaFiltro
            empresas={empresas}
            modulos={modulosUsados.map((m) => ({
              value: m,
              label: MODULE_LABELS[m as Module] ?? m,
            }))}
          />

          {registros.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {total === 0 && !busca && !params.modulo && !params.empresa
                ? "Nada registrado ainda. As alterações passam a aparecer aqui conforme o sistema for usado."
                : "Nenhum registro para esse filtro."}
            </p>
          ) : (
            <div className="divide-y">
              {registros.map((r) => (
                <div key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5 text-sm">
                  <span className="w-28 shrink-0 tabular-nums text-xs text-muted-foreground">
                    {quando(r.at)}
                  </span>
                  <span className="font-medium">{r.userName}</span>
                  <span className={COR_ACAO[r.acao] ?? "text-muted-foreground"}>{r.acao}</span>
                  <span className="font-medium">{r.entidade}</span>
                  <span className="text-muted-foreground">— {r.resumo}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {r.companyName ? (
                      <Badge variant="outline" className="text-[10px]">
                        {r.companyName}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        sistema
                      </Badge>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Pagination
            total={total}
            page={page}
            pageSize={POR_PAGINA}
            basePath="/auditoria"
            params={params}
          />
        </CardContent>
      </Card>
    </div>
  );
}
