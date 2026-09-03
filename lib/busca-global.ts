import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { accessOf, contaAtual, companyIdsDaConta, type Conta } from "@/lib/access";
import { can, type Module } from "@/lib/permissions";
import { getActiveScope, resolveCompanyIds } from "@/lib/scope";
import { formatCurrency, formatDate } from "@/lib/format";

/** A busca que atravessa as telas.
 *
 * O problema que ela resolve é o de não saber ONDE a informação mora: quem
 * ouve "Cirúrgica Santa Catarina" hoje precisa decidir antes se aquilo é um
 * fornecedor, uma transação ou uma conta a pagar, e abrir a tela certa para
 * só então digitar.
 *
 * O risco de uma busca assim é mentir por omissão — devolver "nada
 * encontrado" porque a tela nova nunca foi ligada nela. Por isso as fontes
 * ficam num registro só: ligar uma tela é acrescentar uma entrada aqui, e a
 * revisão de "está tudo coberto?" é ler uma lista, não caçar chamadas
 * espalhadas.
 *
 * Cada fonte tem duas metades, e a divisão é proposital:
 *
 * - **O SQL decide QUAIS linhas.** É onde mora o casamento de texto, que
 *   precisa ignorar acento — e ignorar acento não cabe no `contains` do
 *   Prisma.
 * - **O Prisma busca ESSAS linhas.** Com `select` e `include` tipados, que é
 *   o que mantém a tradução para a tela legível e sem SQL espalhado.
 *
 * Duas regras valem para toda fonte, e por isso são aplicadas fora delas:
 *
 * - **Permissão por empresa, não por conta.** Alguém pode ser operacional
 *   numa unidade e gestor em outra. A busca corta empresa a empresa, com a
 *   mesma matriz que guarda as telas — ela não pode virar a porta dos fundos
 *   para o que a pessoa não abriria pelo menu.
 * - **O escopo aberto manda.** Buscar em tudo faria o resultado levar para
 *   uma unidade que não está na tela. Mas silenciar o que existe fora seria
 *   exatamente a mentira por omissão, então quando nada é encontrado no
 *   escopo a busca diz onde mais procurou e achou. */

export const TIPOS_BUSCA = [
  "transacao",
  "conta-prevista",
  "fornecedor",
  "categoria",
  "medico",
  "fechamento",
  "conta-bancaria",
  "servico",
] as const;

export type TipoBusca = (typeof TIPOS_BUSCA)[number];

export interface ItemBusca {
  id: string;
  tipo: TipoBusca;
  /** O que a pessoa procurou — vai em destaque. */
  titulo: string;
  /** Contexto que separa dois resultados de nome parecido. */
  descricao: string | null;
  /** Canto direito: valor ou data, o que faz reconhecer de bater o olho. */
  detalhe: string | null;
  href: string;
  companyId: string;
  /** Nome da unidade. Só é preenchido quando o escopo aberto abrange mais de
   * uma — dentro de uma unidade só, repetir o nome em cada linha é ruído; na
   * visão da holding, sem ele dois fornecedores homônimos de unidades
   * diferentes viram a mesma linha. */
  empresa: string | null;
}

export interface GrupoBusca {
  tipo: TipoBusca;
  rotulo: string;
  itens: ItemBusca[];
}

export interface ForaDoEscopo {
  companyId: string;
  empresa: string;
  quantos: number;
}

export interface RespostaBusca {
  termo: string;
  grupos: GrupoBusca[];
  total: number;
  /** Unidades fora do escopo aberto onde o termo aparece. Só é preenchido
   * quando o escopo não devolveu nada — ninguém precisa saber do resto
   * enquanto a resposta está na frente dele. */
  fora: ForaDoEscopo[];
}

/** Quantos resultados por tela. Cinco cabem sem rolagem e sem afogar as
 * outras fontes — quem precisa da lista inteira clica e cai na tela, que é
 * onde mora o filtro completo. */
const POR_FONTE = 5;

/** Abaixo de duas letras qualquer termo casa com quase tudo, e a resposta
 * deixa de informar. */
const MINIMO = 2;

/** As letras acentuadas do português e as equivalentes sem acento.
 *
 * `translate` é função de catálogo do Postgres: nada a instalar, nada a
 * migrar, e o mesmo comportamento no banco de teste e no de produção. A
 * alternativa canônica seria a extensão `unaccent`, que resolveria o caso
 * geral — mas exigiria DDL em produção para cobrir um alfabeto que aqui é
 * conhecido e fechado.
 *
 * As duas cadeias andam juntas: mesma quantidade de caracteres, um a um. */
const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucn";

/** Como o termo digitado vira o que se compara.
 *
 * Minúsculas e sem acento, do lado de cá, para bater com o `translate` do
 * lado de lá. E os curingas do LIKE escapados: quem digita "50%" está
 * procurando por "50%", não pedindo "qualquer coisa depois do 50". */
function alvoDoLike(termo: string): string {
  const semAcento = termo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const escapado = semAcento.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escapado}%`;
}

/** A coluna, normalizada do mesmo jeito que o termo. */
function colunaNormalizada(coluna: string) {
  return Prisma.sql`translate(lower(coalesce(${Prisma.raw(`"${coluna}"`)}, '')), ${COM_ACENTO}, ${SEM_ACENTO})`;
}

/** Onde uma fonte procura, e o que decide quais linhas entram no corte. */
interface Alcance {
  /** Tabela do Postgres. Vem daqui, do código — nunca de entrada. */
  tabela: string;
  /** Colunas de texto onde o termo é procurado. Idem. */
  colunas: string[];
  /** A ordem que escolhe as `POR_FONTE` primeiras. A mesma que o Prisma usa
   * ao buscar as linhas, senão o corte e a exibição discordam. */
  ordem: Prisma.Sql;
}

/** Uma tela ligada à busca. */
interface Fonte {
  tipo: TipoBusca;
  rotulo: string;
  /** O módulo que guarda esta tela. É por ele que a busca decide em quais
   * empresas pode procurar. */
  modulo: Module;
  alcance: Alcance;
  /** Traduz as linhas escolhidas para o que a tela mostra. */
  carregar(ids: string[]): Promise<ItemBusca[]>;
}

/** Onde cada fonte pode procurar nesta busca. */
interface Frente {
  fonte: Fonte;
  empresas: string[];
}

/** Os ids que casam com o termo, de TODAS as fontes, numa consulta só.
 *
 * Uma consulta e não oito porque o banco é remoto: cada ida custa cerca de
 * 200ms de rede, e oito idas enfileiradas transformavam a busca em segundos
 * de espera a cada pausa na digitação. `UNION ALL` resolve isso sem abrir mão
 * do corte por fonte — cada trecho mantém a própria ordem e o próprio limite.
 *
 * O SQL é montado com nomes de tabela e coluna vindos do registro acima —
 * constantes do código. Tudo o que vem de fora (termo, empresas, limite) vai
 * como parâmetro, nunca interpolado. */
async function idsQueCasam(
  frentes: Frente[],
  termo: string,
  limite: number
): Promise<Map<TipoBusca, string[]>> {
  const porTipo = new Map<TipoBusca, string[]>();
  if (frentes.length === 0) return porTipo;

  const alvo = alvoDoLike(termo);
  const trechos = frentes.map(({ fonte, empresas }) => {
    const condicoes = Prisma.join(
      fonte.alcance.colunas.map(
        (coluna) => Prisma.sql`${colunaNormalizada(coluna)} LIKE ${alvo} ESCAPE '\\'`
      ),
      " OR "
    );
    // O `::text` não é enfeite: sem ele o Postgres não sabe o tipo do
    // parâmetro que nomeia a fonte e recusa a consulta inteira.
    return Prisma.sql`
      (SELECT ${fonte.tipo}::text AS tipo, "id"
       FROM ${Prisma.raw(`"${fonte.alcance.tabela}"`)}
       WHERE "companyId" IN (${Prisma.join(empresas)})
         AND (${condicoes})
       ORDER BY ${fonte.alcance.ordem}
       LIMIT ${limite})
    `;
  });

  const linhas = await prisma.$queryRaw<{ tipo: TipoBusca; id: string }[]>(
    Prisma.join(trechos, " UNION ALL ")
  );

  for (const linha of linhas) {
    const atual = porTipo.get(linha.tipo);
    if (atual) atual.push(linha.id);
    else porTipo.set(linha.tipo, [linha.id]);
  }
  return porTipo;
}

const FONTES: Fonte[] = [
  {
    tipo: "transacao",
    rotulo: "Transações",
    modulo: "transacoes",
    alcance: { tabela: "Transaction", colunas: ["description"], ordem: Prisma.sql`"date" DESC, "id" ASC` },
    async carregar(ids) {
      const linhas = await prisma.transaction.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          companyId: true,
          description: true,
          amount: true,
          date: true,
          type: true,
          category: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { id: "asc" }],
      });
      return linhas.map((t) => ({
        id: t.id,
        tipo: "transacao" as const,
        titulo: t.description,
        descricao: [t.type === "INCOME" ? "Entrada" : "Saída", t.category?.name, formatDate(t.date)]
          .filter(Boolean)
          .join(" · "),
        detalhe: formatCurrency(Number(t.amount)),
        // Não existe tela de uma transação só: o destino é a lista filtrada
        // pela descrição DESTE lançamento, e não pelo termo digitado. O
        // filtro da tela não ignora acento; mandar "manutencao" para lá faria
        // a busca achar e a tela dizer que não existe.
        href: `/transacoes?q=${encodeURIComponent(t.description)}`,
        companyId: t.companyId,
        empresa: null,
      }));
    },
  },
  {
    tipo: "conta-prevista",
    rotulo: "A Pagar e a Receber",
    modulo: "contas-a-pagar-receber",
    alcance: {
      tabela: "ScheduledEntry",
      colunas: ["description"],
      ordem: Prisma.sql`"dueDate" ASC, "id" ASC`,
    },
    async carregar(ids) {
      const linhas = await prisma.scheduledEntry.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          companyId: true,
          description: true,
          amount: true,
          dueDate: true,
          type: true,
          status: true,
        },
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      });
      return linhas.map((e) => ({
        id: e.id,
        tipo: "conta-prevista" as const,
        titulo: e.description,
        descricao: [
          e.type === "PAYABLE" ? "A pagar" : "A receber",
          e.status === "PAID" ? "Baixado" : `Vence ${formatDate(e.dueDate)}`,
        ].join(" · "),
        detalhe: formatCurrency(Number(e.amount)),
        href: `/contas-a-pagar-receber?q=${encodeURIComponent(e.description)}&aba=${
          e.type === "PAYABLE" ? "payable" : "receivable"
        }`,
        companyId: e.companyId,
        empresa: null,
      }));
    },
  },
  {
    tipo: "fornecedor",
    rotulo: "Fornecedores",
    modulo: "fornecedores",
    alcance: {
      tabela: "Supplier",
      // Mesmo alcance da busca da tela: quem procura fornecedor tem na mão um
      // pedaço de qualquer um desses campos.
      colunas: ["name", "document", "email"],
      ordem: Prisma.sql`"name" ASC`,
    },
    async carregar(ids) {
      const linhas = await prisma.supplier.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true, name: true, document: true, phone: true },
        orderBy: { name: "asc" },
      });
      return linhas.map((s) => ({
        id: s.id,
        tipo: "fornecedor" as const,
        titulo: s.name,
        descricao: [s.document, s.phone].filter(Boolean).join(" · ") || null,
        detalhe: null,
        href: `/fornecedores?q=${encodeURIComponent(s.name)}`,
        companyId: s.companyId,
        empresa: null,
      }));
    },
  },
  {
    tipo: "categoria",
    rotulo: "Categorias",
    modulo: "categorias",
    alcance: { tabela: "Category", colunas: ["name", "costCenter"], ordem: Prisma.sql`"name" ASC` },
    async carregar(ids) {
      const linhas = await prisma.category.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true, name: true, type: true, costCenter: true },
        orderBy: { name: "asc" },
      });
      return linhas.map((c) => ({
        id: c.id,
        tipo: "categoria" as const,
        titulo: c.name,
        descricao: [c.type === "INCOME" ? "Entrada" : "Saída", c.costCenter].filter(Boolean).join(" · "),
        detalhe: null,
        href: `/categorias?q=${encodeURIComponent(c.name)}`,
        companyId: c.companyId,
        empresa: null,
      }));
    },
  },
  {
    tipo: "medico",
    rotulo: "Médicos",
    modulo: "medicos",
    alcance: {
      tabela: "Doctor",
      colunas: ["name", "specialty"],
      ordem: Prisma.sql`"active" DESC, "name" ASC`,
    },
    async carregar(ids) {
      const linhas = await prisma.doctor.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true, name: true, specialty: true, active: true },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      });
      return linhas.map((d) => ({
        id: d.id,
        tipo: "medico" as const,
        titulo: d.name,
        descricao: [d.specialty, !d.active && "Inativo"].filter(Boolean).join(" · "),
        detalhe: null,
        // Aqui existe ficha própria — o resultado leva direto a ela.
        href: `/medicos/${d.id}`,
        companyId: d.companyId,
        empresa: null,
      }));
    },
  },
  {
    tipo: "fechamento",
    rotulo: "Fechamentos de Caixa",
    modulo: "fechamento-caixa",
    alcance: {
      tabela: "CashClosing",
      // A observação é o único texto livre do fechamento, e é onde vai parar
      // a explicação de uma diferença — que é justamente o que alguém procura
      // meses depois.
      colunas: ["notes"],
      ordem: Prisma.sql`"date" DESC, "id" ASC`,
    },
    async carregar(ids) {
      const linhas = await prisma.cashClosing.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true, date: true, notes: true, countedCash: true, status: true },
        orderBy: [{ date: "desc" }, { id: "asc" }],
      });
      return linhas.map((c) => ({
        id: c.id,
        tipo: "fechamento" as const,
        titulo: `Fechamento de ${formatDate(c.date)}`,
        descricao: [c.status === "APROVADO" ? "Aprovado" : "Pendente", c.notes].filter(Boolean).join(" · "),
        detalhe: formatCurrency(Number(c.countedCash)),
        // `ver` abre o detalhe e, desde a paginação, também acerta a página.
        href: `/fechamento-caixa?ver=${c.id}`,
        companyId: c.companyId,
        empresa: null,
      }));
    },
  },
  {
    tipo: "conta-bancaria",
    rotulo: "Contas Bancárias",
    modulo: "contas-bancarias",
    alcance: { tabela: "Account", colunas: ["name", "bank"], ordem: Prisma.sql`"name" ASC` },
    async carregar(ids) {
      const linhas = await prisma.account.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true, name: true, bank: true, type: true },
        orderBy: { name: "asc" },
      });
      return linhas.map((a) => ({
        id: a.id,
        tipo: "conta-bancaria" as const,
        titulo: a.name,
        descricao: [a.type, a.bank].filter(Boolean).join(" · "),
        detalhe: null,
        href: "/contas-bancarias",
        companyId: a.companyId,
        empresa: null,
      }));
    },
  },
  {
    tipo: "servico",
    rotulo: "Catálogo de Serviços",
    modulo: "operacao",
    alcance: {
      tabela: "ServiceItem",
      colunas: ["name", "group"],
      ordem: Prisma.sql`"active" DESC, "name" ASC`,
    },
    async carregar(ids) {
      const linhas = await prisma.serviceItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true, name: true, group: true, price: true, active: true },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      });
      return linhas.map((i) => ({
        id: i.id,
        tipo: "servico" as const,
        titulo: i.name,
        descricao: [i.group, !i.active && "Arquivado"].filter(Boolean).join(" · ") || null,
        detalhe: i.price == null ? null : formatCurrency(Number(i.price)),
        // O catálogo é uma tabela com busca própria; o parâmetro já entrega
        // a ela o item escolhido, para a pessoa não procurar duas vezes.
        href: `/operacao?catalogo=${encodeURIComponent(i.name)}`,
        companyId: i.companyId,
        empresa: null,
      }));
    },
  },
];

/** As empresas, entre as candidatas, em que esta conta pode LER este módulo. */
function empresasPermitidas(conta: Conta | null, candidatas: string[], modulo: Module): string[] {
  return candidatas.filter((id) => can(accessOf(conta, id), modulo, "ver"));
}

/** Roda todas as fontes sobre um conjunto de empresas.
 *
 * Duas etapas, e não uma por fonte: primeiro UMA consulta acha os ids de
 * todas, depois só as fontes que acharam algo vão buscar as linhas. Numa
 * busca típica isso é uma consulta mais duas ou três, em vez de dezesseis. */
async function varrer(
  conta: Conta | null,
  termo: string,
  candidatas: string[],
  limite: number
): Promise<GrupoBusca[]> {
  if (candidatas.length === 0) return [];

  const frentes = FONTES.map((fonte) => ({
    fonte,
    empresas: empresasPermitidas(conta, candidatas, fonte.modulo),
  })).filter((f) => f.empresas.length > 0);

  const idsPorTipo = await idsQueCasam(frentes, termo, limite);
  if (idsPorTipo.size === 0) return [];

  const grupos = await Promise.all(
    frentes.map(async ({ fonte }) => {
      const ids = idsPorTipo.get(fonte.tipo);
      if (!ids || ids.length === 0) return null;
      const itens = await fonte.carregar(ids);
      return itens.length > 0 ? { tipo: fonte.tipo, rotulo: fonte.rotulo, itens } : null;
    })
  );

  return grupos.filter((g): g is GrupoBusca => g !== null);
}

/** Escreve o nome da unidade em cada resultado, numa consulta só para todas
 * as fontes. */
async function rotularEmpresas(grupos: GrupoBusca[]): Promise<void> {
  const ids = new Set(grupos.flatMap((g) => g.itens.map((i) => i.companyId)));
  if (ids.size === 0) return;
  const empresas = await prisma.company.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true },
  });
  const nomes = new Map(empresas.map((e) => [e.id, e.name]));
  for (const grupo of grupos) {
    for (const item of grupo.itens) item.empresa = nomes.get(item.companyId) ?? null;
  }
}

/** A busca. Devolve o que existe no escopo aberto e, só se não houver nada
 * lá, onde mais o termo aparece. */
export async function buscarGlobal(entrada: string): Promise<RespostaBusca> {
  const termo = entrada.trim();
  if (termo.length < MINIMO) return { termo, grupos: [], total: 0, fora: [] };

    const conta = await contaAtual();
  if (!conta) return { termo, grupos: [], total: 0, fora: [] };

  // Conta e empresas visíveis resolvidas UMA vez e passadas adiante. Deixar
  // cada camada perguntar de novo custava três voltas ao Supabase Auth e três
  // consultas de conta por busca — e a busca dispara a cada pausa na digitação.
  const visiveis = await companyIdsDaConta(conta);
  const escopo = await getActiveScope(visiveis);
  const noEscopo = await resolveCompanyIds(escopo, visiveis);
  const grupos = await varrer(conta, termo, noEscopo, POR_FONTE);
  const total = grupos.reduce((soma, g) => soma + g.itens.length, 0);

  if (total > 0) {
    if (noEscopo.length > 1) await rotularEmpresas(grupos);
    return { termo, grupos, total, fora: [] };
  }

  // Nada no escopo. Antes de responder "não existe", olha nas outras unidades
  // que a conta enxerga — a diferença entre "não existe" e "existe, mas não
  // onde você está olhando" é a diferença entre a busca ajudar e a busca
  // enganar.
  const restantes = visiveis.filter((id) => !noEscopo.includes(id));
  if (restantes.length === 0) return { termo, grupos: [], total: 0, fora: [] };

  const gruposFora = await varrer(conta, termo, restantes, POR_FONTE);
  const porEmpresa = new Map<string, number>();
  for (const grupo of gruposFora) {
    for (const item of grupo.itens) {
      porEmpresa.set(item.companyId, (porEmpresa.get(item.companyId) ?? 0) + 1);
    }
  }
  if (porEmpresa.size === 0) return { termo, grupos: [], total: 0, fora: [] };

  const empresas = await prisma.company.findMany({
    where: { id: { in: [...porEmpresa.keys()] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return {
    termo,
    grupos: [],
    total: 0,
    fora: empresas.map((e) => ({
      companyId: e.id,
      empresa: e.name,
      quantos: porEmpresa.get(e.id) ?? 0,
    })),
  };
}
