import { beforeEach, describe, expect, it, vi } from "vitest";

/** A sessão do teste. Mutável entre os casos para trocar de conta. */
const sessao: { authId: string | null } = { authId: null };
/** O escopo ativo, que normalmente vem do cookie. */
const escopo: { valor: string | null } = { valor: null };

/** Mesma montagem de `lib/access.test.ts`: só a SESSÃO é simulada.
 *
 * A busca precisa ser exercitada com permissão de verdade — ela lê oito
 * tabelas de uma vez, e é exatamente o tipo de atalho que vaza dado de
 * unidade alheia se a matriz não for aplicada. Em modo aberto todo caso
 * correria como holding e o teste não provaria nada. */
vi.mock("@/lib/auth", () => ({
  MODO_ABERTO: false,
  requireUser: async () => {
    if (!sessao.authId) throw new Error("Sessão expirada. Faça login novamente.");
    return { id: sessao.authId };
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (nome === "fluxojr_scope" && escopo.valor ? { value: escopo.valor } : undefined),
    set: () => {},
  }),
}));

import { resetDb, testPrisma } from "@/tests/helpers/db";
import { buscarGlobal, type RespostaBusca } from "@/lib/busca-global";
import { parseDateOnly } from "@/lib/date-only";

beforeEach(async () => {
  await resetDb();
  sessao.authId = null;
  escopo.valor = null;
});

/** Duas unidades com o mesmo fornecedor e o mesmo médico, para provar que o
 * corte é por unidade e não por nome. */
async function cenario() {
  const contagem = await testPrisma.company.create({ data: { name: "AS Contagem" } });
  const laguna = await testPrisma.company.create({ data: { name: "AS Laguna" } });

  for (const empresa of [contagem, laguna]) {
    const conta = await testPrisma.account.create({
      data: { companyId: empresa.id, name: "Caixa Físico", type: "CASH" },
    });
    const categoria = await testPrisma.category.create({
      data: { companyId: empresa.id, name: "Insumos Cirúrgicos", type: "EXPENSE" },
    });
    await testPrisma.supplier.create({
      data: { companyId: empresa.id, name: "Cirúrgica Santa Catarina", document: "11.222.333/0001-44" },
    });
    await testPrisma.doctor.create({
      data: { companyId: empresa.id, name: "Dra. Helane Cirúrgica", specialty: "Ortopedia" },
    });
    await testPrisma.transaction.create({
      data: {
        companyId: empresa.id,
        accountId: conta.id,
        categoryId: categoria.id,
        description: "Cirúrgica SC — pedido de insumos",
        amount: 6120.4,
        type: "EXPENSE",
        date: parseDateOnly("2026-08-22"),
      },
    });
  }

  await testPrisma.appUser.create({
    data: {
      authId: "auth-operacional",
      email: "recepcao@teste.local",
      name: "Recepção",
      senhaProvisoria: false,
      access: { create: [{ companyId: contagem.id, role: "OPERACIONAL" }] },
    },
  });
  await testPrisma.appUser.create({
    data: {
      authId: "auth-financeiro",
      email: "financeiro@teste.local",
      name: "Financeiro",
      senhaProvisoria: false,
      access: { create: [{ companyId: contagem.id, role: "FINANCEIRO" }] },
    },
  });
  await testPrisma.appUser.create({
    data: {
      authId: "auth-holding",
      email: "diretoria@teste.local",
      name: "Diretoria",
      holding: true,
      senhaProvisoria: false,
    },
  });

  return { contagem, laguna };
}

function entrar(authId: string, valorDoEscopo: string) {
  sessao.authId = authId;
  escopo.valor = valorDoEscopo;
}

function tipos(r: RespostaBusca) {
  return r.grupos.map((g) => g.tipo).sort();
}

function unidadesDosResultados(r: RespostaBusca) {
  return [...new Set(r.grupos.flatMap((g) => g.itens.map((i) => i.companyId)))];
}

describe("o que a busca devolve", () => {
  it("atravessa as telas com um termo só", async () => {
    const { contagem } = await cenario();
    entrar("auth-financeiro", `company:${contagem.id}`);

    const r = await buscarGlobal("cirúrgica");

    // O mesmo texto aparece em fornecedor, transação, médico e categoria —
    // é justamente o caso que a busca existe para resolver.
    expect(tipos(r)).toEqual(["fornecedor", "medico", "transacao"]);
    expect(r.total).toBe(3);
  });

  it("ignora maiúscula e minúscula", async () => {
    const { contagem } = await cenario();
    entrar("auth-financeiro", `company:${contagem.id}`);

    expect((await buscarGlobal("CIRÚRGICA")).total).toBe(3);
  });

  it("acha fornecedor pelo documento, não só pelo nome", async () => {
    const { contagem } = await cenario();
    entrar("auth-financeiro", `company:${contagem.id}`);

    const r = await buscarGlobal("11.222.333");
    expect(r.grupos.map((g) => g.tipo)).toEqual(["fornecedor"]);
  });

  it("não responde a termo de uma letra", async () => {
    const { contagem } = await cenario();
    entrar("auth-holding", `company:${contagem.id}`);

    const r = await buscarGlobal("c");
    expect(r.total).toBe(0);
    expect(r.fora).toEqual([]);
  });

  it("cada resultado leva a algum lugar", async () => {
    const { contagem } = await cenario();
    entrar("auth-financeiro", `company:${contagem.id}`);

    const r = await buscarGlobal("cirúrgica");
    for (const grupo of r.grupos) {
      for (const item of grupo.itens) {
        expect(item.href.startsWith("/")).toBe(true);
        expect(item.titulo.length).toBeGreaterThan(0);
      }
    }
  });

  it("o destino aponta para o registro, não para o termo digitado", async () => {
    const { contagem } = await cenario();
    entrar("auth-financeiro", `company:${contagem.id}`);

    // A tela de destino filtra com `contains`, que é sensível a acento. Se o
    // link levasse o termo sem acento, a busca acharia e a tela responderia
    // que não existe — a mentira só mudaria de lugar.
    const r = await buscarGlobal("cirurgica");
    const fornecedor = r.grupos.find((g) => g.tipo === "fornecedor")?.itens[0];
    expect(fornecedor?.href).toBe(
      `/fornecedores?q=${encodeURIComponent("Cirúrgica Santa Catarina")}`
    );
  });
});

describe("o acento não atrapalha", () => {
  it("acha o acentuado com o termo sem acento", async () => {
    const { contagem } = await cenario();
    entrar("auth-financeiro", `company:${contagem.id}`);

    // Ninguém digita acento numa caixa de busca. Sem isto, "cirurgica" não
    // acharia "Cirúrgica" — e a busca falharia justamente na entrada mais
    // natural de quem escreve em português.
    const semAcento = await buscarGlobal("cirurgica");
    const comAcento = await buscarGlobal("cirúrgica");
    expect(semAcento.total).toBe(comAcento.total);
    expect(semAcento.total).toBeGreaterThan(0);
  });

  it("acha o sem acento com o termo acentuado", async () => {
    const { contagem } = await cenario();
    await testPrisma.supplier.create({
      data: { companyId: contagem.id, name: "Ortopedia Servicos" },
    });
    entrar("auth-financeiro", `company:${contagem.id}`);

    expect((await buscarGlobal("serviços")).total).toBeGreaterThan(0);
  });

  it("trata cedilha e til", async () => {
    const { contagem } = await cenario();
    await testPrisma.category.create({
      data: { companyId: contagem.id, name: "Manutenção de Equipamentos", type: "EXPENSE" },
    });
    entrar("auth-financeiro", `company:${contagem.id}`);

    expect((await buscarGlobal("manutencao")).total).toBe(1);
  });
});

describe("o termo é dado, não comando", () => {
  it("o curinga do LIKE digitado vale como texto", async () => {
    const { contagem } = await cenario();
    await testPrisma.supplier.create({
      data: { companyId: contagem.id, name: "Desconto de 50% ao ano" },
    });
    entrar("auth-financeiro", `company:${contagem.id}`);

    // "%" digitado procura o caractere "%", não "qualquer coisa".
    expect((await buscarGlobal("50%")).total).toBe(1);
    expect((await buscarGlobal("z%z")).total).toBe(0);
  });

  it("o sublinhado do LIKE digitado vale como texto", async () => {
    const { contagem } = await cenario();
    await testPrisma.supplier.create({ data: { companyId: contagem.id, name: "nota_fiscal" } });
    entrar("auth-financeiro", `company:${contagem.id}`);

    expect((await buscarGlobal("nota_fiscal")).total).toBe(1);
    // Com "_" valendo como curinga, isto casaria com "nota_fiscal" — e a
    // busca inventaria um resultado que ninguém pediu.
    expect((await buscarGlobal("notaxfiscal")).total).toBe(0);
  });

  it("aspas e barra invertida não quebram a consulta", async () => {
    const { contagem } = await cenario();
    entrar("auth-financeiro", `company:${contagem.id}`);

    const perigoso = "a'\\\"; drop table";
    await expect(buscarGlobal(perigoso)).resolves.toMatchObject({ total: 0 });
  });
});

describe("a busca respeita a permissão", () => {
  it("não devolve o que a conta não abriria pelo menu", async () => {
    const { contagem } = await cenario();
    // Operacional não tem Transações, Fornecedores nem Categorias.
    entrar("auth-operacional", `company:${contagem.id}`);

    const r = await buscarGlobal("cirúrgica");

    expect(tipos(r)).toEqual(["medico"]);
  });

  it("a mesma busca devolve mais para quem pode mais", async () => {
    const { contagem } = await cenario();

    entrar("auth-operacional", `company:${contagem.id}`);
    const doOperacional = await buscarGlobal("cirúrgica");
    entrar("auth-financeiro", `company:${contagem.id}`);
    const doFinanceiro = await buscarGlobal("cirúrgica");

    expect(doOperacional.total).toBeLessThan(doFinanceiro.total);
  });

  it("sessão sem conta no sistema não busca nada", async () => {
    await cenario();
    entrar("auth-desconhecido", "all");

    const r = await buscarGlobal("cirúrgica");
    expect(r.total).toBe(0);
    expect(r.fora).toEqual([]);
  });
});

describe("a busca respeita o escopo aberto", () => {
  it("dentro de uma unidade, só devolve daquela unidade", async () => {
    const { contagem } = await cenario();
    entrar("auth-holding", `company:${contagem.id}`);

    const r = await buscarGlobal("cirúrgica");
    expect(unidadesDosResultados(r)).toEqual([contagem.id]);
  });

  it("na visão da holding, marca a unidade de cada resultado", async () => {
    const { contagem, laguna } = await cenario();
    entrar("auth-holding", "all");

    const r = await buscarGlobal("cirúrgica");
    expect(unidadesDosResultados(r).sort()).toEqual([contagem.id, laguna.id].sort());
    // Sem o nome da unidade, dois fornecedores homônimos viram a mesma linha.
    for (const grupo of r.grupos) {
      for (const item of grupo.itens) expect(item.empresa).toMatch(/AS (Contagem|Laguna)/);
    }
  });

  it("numa unidade só, não repete o nome dela em cada linha", async () => {
    const { contagem } = await cenario();
    entrar("auth-holding", `company:${contagem.id}`);

    const r = await buscarGlobal("cirúrgica");
    for (const grupo of r.grupos) {
      for (const item of grupo.itens) expect(item.empresa).toBeNull();
    }
  });
});

describe("o que existe fora do escopo", () => {
  it("diz onde achou quando não achou aqui", async () => {
    const { contagem, laguna } = await cenario();
    await testPrisma.supplier.create({
      data: { companyId: laguna.id, name: "Vivo Empresas" },
    });
    entrar("auth-holding", `company:${contagem.id}`);

    const r = await buscarGlobal("Vivo");

    // "Não existe" e "existe, mas não onde você está olhando" são respostas
    // diferentes — e a segunda é a que evita a busca enganar.
    expect(r.total).toBe(0);
    expect(r.fora).toEqual([{ companyId: laguna.id, empresa: "AS Laguna", quantos: 1 }]);
  });

  it("não aponta para unidade que a conta não enxerga", async () => {
    const { contagem, laguna } = await cenario();
    await testPrisma.supplier.create({ data: { companyId: laguna.id, name: "Vivo Empresas" } });
    // O financeiro só tem acesso à Contagem.
    entrar("auth-financeiro", `company:${contagem.id}`);

    const r = await buscarGlobal("Vivo");
    expect(r.total).toBe(0);
    expect(r.fora).toEqual([]);
  });

  it("fica calado sobre o resto quando já achou aqui", async () => {
    const { contagem } = await cenario();
    entrar("auth-holding", `company:${contagem.id}`);

    const r = await buscarGlobal("cirúrgica");
    expect(r.total).toBeGreaterThan(0);
    expect(r.fora).toEqual([]);
  });
});
