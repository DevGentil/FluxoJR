import { prisma } from "@/lib/prisma";
import { contaAtual } from "@/lib/access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { Pagination } from "@/components/pagination";
import { CircleCheck, TriangleAlert, Clock } from "lucide-react";
import { contarParaLimpeza } from "./actions";
import { ErrosLista } from "./erros-lista";
import { FiltrosErros } from "./filtros-erros";
import { GRAVIDADES, type Gravidade } from "@/lib/erro-gravidade";
import type { Prisma } from "@/lib/generated/prisma/client";

interface Props {
  searchParams: Promise<{ page?: string; gravidade?: string; estado?: string }>;
}

const POR_PAGINA = 25;

/** Fora do corpo do componente porque `Date.now()` no render viola a regra
 * de pureza do React — a mesma correção que o Dashboard já tinha. */
function desdeOntem() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

/** Só aceita o que existe. O filtro vem da URL, e URL é dado de fora: sem
 * isto, `?gravidade=qualquer` viraria consulta inválida. */
function gravidadeValida(valor?: string): Gravidade | undefined {
  return (GRAVIDADES as readonly string[]).includes(valor ?? "")
    ? (valor as Gravidade)
    : undefined;
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
  const gravidade = gravidadeValida(params.gravidade);
  const estado = params.estado === "novos" || params.estado === "vistos" ? params.estado : undefined;

  // O filtro roda no BANCO, não em memória: a paginação conta o total antes
  // de escolher a página, e filtrar depois mostraria páginas vazias.
  //
  // O estado entra na contagem por gravidade — para os números dos botões
  // baterem com o que aparece ao clicar — mas a gravidade não, senão cada
  // botão mostraria zero para as outras.
  const filtroEstado: Prisma.ErrorLogWhereInput =
    estado === "novos" ? { seen: false } : estado === "vistos" ? { seen: true } : {};
  const where: Prisma.ErrorLogWhereInput = {
    ...filtroEstado,
    ...(gravidade ? { severity: gravidade } : {}),
  };

  const [total, filtrados, naoVistos, ultimas24h, criticos, erros, limpeza, porGravidade] =
    await Promise.all([
      prisma.errorLog.count(),
      prisma.errorLog.count({ where }),
      prisma.errorLog.count({ where: { seen: false } }),
      prisma.errorLog.count({ where: { at: { gte: desdeOntem() } } }),
      prisma.errorLog.count({ where: { severity: "CRITICO", seen: false } }),
      prisma.errorLog.findMany({
        where,
        orderBy: { at: "desc" },
        skip: (page - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
      contarParaLimpeza(),
      prisma.errorLog.groupBy({ by: ["severity"], where: filtroEstado, _count: { _all: true } }),
    ]);

  const contagem: Record<Gravidade, number> = { CRITICO: 0, ERRO: 0, AVISO: 0 };
  for (const linha of porGravidade) contagem[linha.severity as Gravidade] = linha._count._all;
  const totalDoEstado = contagem.CRITICO + contagem.ERRO + contagem.AVISO;

  const filtrando = Boolean(gravidade || estado);

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
        {/* Crítico sem ver vem primeiro: é o único número que pede ação
            agora. "Não vistos" sozinho misturava a queda do banco com uma
            sessão vencida de alguém. */}
        <KpiCard
          label="Críticos sem ver"
          value={String(criticos)}
          hint={criticos > 0 ? "O sistema ficou fora" : "Nenhum agora"}
          icon={criticos > 0 ? TriangleAlert : CircleCheck}
          iconClass={criticos > 0 ? "text-red-500" : "text-emerald-500"}
        />
        <KpiCard
          label="Não vistos"
          value={String(naoVistos)}
          hint={naoVistos > 0 ? "Ninguém olhou ainda" : "Tudo revisado"}
          icon={naoVistos > 0 ? TriangleAlert : CircleCheck}
          iconClass={naoVistos > 0 ? "text-amber-500" : "text-emerald-500"}
        />
        <KpiCard
          label="Últimas 24 horas"
          value={String(ultimas24h)}
          icon={Clock}
          iconClass="text-sky-500"
        />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle>
              {filtrando ? `${filtrados} de ${total} registro(s)` : `${total} registro(s)`}
            </CardTitle>
            <CardDescription>
              O mais recente primeiro. Cada linha mostra a causa resumida — abra para ver a mensagem
              inteira e a pilha.
            </CardDescription>
          </div>
          <FiltrosErros contagem={contagem} total={totalDoEstado} />
        </CardHeader>
        <CardContent className="space-y-4">
          {erros.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-emerald-500" />
              {filtrando
                ? "Nenhum erro com esse filtro."
                : "Nenhum erro registrado. É o resultado que se quer aqui."}
            </p>
          ) : (
            <ErrosLista
              erros={erros}
              antigos={limpeza.antigos}
              total={limpeza.total}
              naoVistos={naoVistos}
            />
          )}
          <Pagination
            total={filtrados}
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
