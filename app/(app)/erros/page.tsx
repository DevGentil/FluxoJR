import { prisma } from "@/lib/prisma";
import { contaAtual } from "@/lib/access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/kpi-card";
import { Pagination } from "@/components/pagination";
import { CircleCheck, TriangleAlert, Clock } from "lucide-react";
import { marcarTodosVistos } from "./actions";
import { ErroLinha } from "./erro-linha";

interface Props {
  searchParams: Promise<{ page?: string }>;
}

const POR_PAGINA = 25;

/** Fora do corpo do componente porque `Date.now()` no render viola a regra
 * de pureza do React — a mesma correção que o Dashboard já tinha. */
function desdeOntem() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

/** Os erros que estouraram em produção.
 *
 * Existe para responder "o sistema quebrou para alguém?" sem depender de a
 * pessoa avisar. Só a holding vê: erro de aplicação é assunto de quem mantém
 * o software, não de quem opera a unidade. */
export default async function ErrosPage({ searchParams }: Props) {
  const conta = await contaAtual();
  if (!conta?.holding) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Erros do Sistema</h1>
        <p className="text-muted-foreground text-sm">Esta tela é da holding.</p>
      </div>
    );
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [total, naoVistos, ultimas24h, erros] = await Promise.all([
    prisma.errorLog.count(),
    prisma.errorLog.count({ where: { seen: false } }),
    prisma.errorLog.count({ where: { at: { gte: desdeOntem() } } }),
    prisma.errorLog.findMany({
      orderBy: { at: "desc" },
      skip: (page - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Erros do Sistema</h1>
        <p className="text-muted-foreground text-sm">
          Tudo que estourou no servidor, com o mesmo código que a pessoa vê na tela de erro — é por ele
          que se liga o print recebido ao registro daqui.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Não vistos"
          value={String(naoVistos)}
          hint={naoVistos > 0 ? "Ninguém olhou ainda" : "Tudo revisado"}
          icon={naoVistos > 0 ? TriangleAlert : CircleCheck}
          iconClass={naoVistos > 0 ? "text-amber-500" : "text-emerald-500"}
        />
        <KpiCard label="Últimas 24 horas" value={String(ultimas24h)} icon={Clock} iconClass="text-sky-500" />
        <KpiCard label="Total registrado" value={String(total)} icon={TriangleAlert} iconClass="text-muted-foreground" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{total} registro(s)</CardTitle>
            <CardDescription>
              O mais recente primeiro. Cada linha mostra a causa resumida — abra para ver a mensagem
              inteira e a pilha.
            </CardDescription>
          </div>
          {naoVistos > 0 && (
            <form action={marcarTodosVistos}>
              <Button type="submit" size="sm" variant="secondary">
                <CircleCheck className="size-4" />
                Marcar todos como vistos
              </Button>
            </form>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {erros.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <CircleCheck className="size-4 text-emerald-500" />
              Nenhum erro registrado. É o resultado que se quer aqui.
            </p>
          ) : (
            <div className="divide-y">
              {erros.map((e) => (
                <ErroLinha
                  key={e.id}
                  erro={{
                    id: e.id,
                    at: e.at,
                    message: e.message,
                    digest: e.digest,
                    stack: e.stack,
                    route: e.route,
                    method: e.method,
                    seen: e.seen,
                  }}
                />
              ))}
            </div>
          )}
          <Pagination
            total={total}
            page={page}
            pageSize={POR_PAGINA}
            basePath="/erros"
            params={params}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Esta tela responde &quot;quebrou?&quot; quando alguém vem olhar. Ela não avisa sozinha — para
        alerta por e-mail ou celular no momento da falha, o caminho é um serviço de monitoramento
        externo, que fica para depois do piloto.
      </p>
    </div>
  );
}
