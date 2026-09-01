import { beforeEach, describe, expect, it, vi } from "vitest";

/** A sessão do teste. Mutável entre os casos para trocar de conta. */
const sessao: { authId: string | null } = { authId: null };
/** O escopo ativo, que normalmente vem do cookie. */
const escopo: { companyId: string | null } = { companyId: null };

/** Só a SESSÃO é simulada — o que de fato não existe fora de uma requisição.
 *
 * Tudo o mais roda de verdade: `contaAtual` lê a conta no banco,
 * `lib/permissions` decide, `getActiveCompanyId` barra. É o que diferencia
 * este arquivo dos outros testes de integração, que rodam em modo aberto e
 * portanto passam por cima de toda a permissão sem exercitá-la. */
vi.mock("@/lib/auth", () => ({
  MODO_ABERTO: false,
  requireUser: async () => {
    if (!sessao.authId) throw new Error("Sessão expirada. Faça login novamente.");
    return { id: sessao.authId };
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) =>
      nome === "fluxojr_scope" && escopo.companyId
        ? { value: `company:${escopo.companyId}` }
        : undefined,
    set: () => {},
  }),
}));

import { resetDb, testPrisma } from "@/tests/helpers/db";
import { getActiveCompanyId, getActiveScope, resolveCompanyIds } from "@/lib/scope";
import { moduleOfPath } from "@/lib/permissions";
import { contaAtual, companyIdsVisiveis, modulosVisiveis } from "@/lib/access";
import { createDailyEntry } from "@/app/(app)/repasses-medicos/daily-entries-actions";
import { createTransaction } from "@/app/(app)/transacoes/actions";
import { parseDateOnly } from "@/lib/date-only";

beforeEach(async () => {
  await resetDb();
  sessao.authId = null;
  escopo.companyId = null;
});

async function cenario() {
  const contagem = await testPrisma.company.create({ data: { name: "AS Contagem" } });
  const laguna = await testPrisma.company.create({ data: { name: "AS Laguna" } });

  const consulta = await testPrisma.serviceItem.create({
    data: { companyId: contagem.id, name: "Consulta", category: "CONSULTA" },
  });
  const doctor = await testPrisma.doctor.create({
    data: {
      companyId: contagem.id,
      name: "Dra. Helane",
      serviceRates: {
        create: [{ serviceItemId: consulta.id, rate: 35, validFrom: parseDateOnly("2026-01-01") }],
      },
    },
  });
  const conta = await testPrisma.account.create({
    data: { companyId: contagem.id, name: "Caixa", type: "CASH" },
  });

  const operacional = await testPrisma.appUser.create({
    data: {
      authId: "auth-operacional",
      email: "recepcao@teste.local",
      name: "Recepção",
      senhaProvisoria: false,
      access: { create: [{ companyId: contagem.id, role: "OPERACIONAL" }] },
    },
  });
  const holding = await testPrisma.appUser.create({
    data: {
      authId: "auth-holding",
      email: "diretoria@teste.local",
      name: "Diretoria",
      holding: true,
      senhaProvisoria: false,
    },
  });

  return { contagem, laguna, doctor, conta, operacional, holding };
}

function entrar(authId: string, companyId: string) {
  sessao.authId = authId;
  escopo.companyId = companyId;
}

describe("a sessão determina a conta", () => {
  it("lê a conta certa do banco", async () => {
    const { contagem } = await cenario();
    entrar("auth-operacional", contagem.id);

    const conta = await contaAtual();
    expect(conta?.name).toBe("Recepção");
    expect(conta?.holding).toBe(false);
    expect(conta?.papeis.get(contagem.id)).toBe("OPERACIONAL");
  });

  it("sessão que existe no Supabase mas não tem conta aqui não acessa nada", async () => {
    // A falha segura: conta criada por fora do sistema não entra.
    await cenario();
    entrar("auth-desconhecido", "qualquer");

    expect(await contaAtual()).toBeNull();
    expect(await companyIdsVisiveis()).toEqual([]);
  });

  it("conta desativada deixa de acessar imediatamente", async () => {
    const { contagem, operacional } = await cenario();
    await testPrisma.appUser.update({ where: { id: operacional.id }, data: { active: false } });
    entrar("auth-operacional", contagem.id);

    expect(await contaAtual()).toBeNull();
  });
});

describe("escrita: getActiveCompanyId", () => {
  it("deixa o Operacional gravar na unidade dele", async () => {
    const { contagem } = await cenario();
    entrar("auth-operacional", contagem.id);

    await expect(getActiveCompanyId("repasses-medicos")).resolves.toBe(contagem.id);
  });

  it("cookie apontando para unidade alheia grava na PRÓPRIA, nunca na alheia", async () => {
    // O buraco de antes: o escopo vinha do cookie e só se validava que a
    // empresa existia. Trocar o cookie dava escrita em qualquer unidade.
    //
    // A correção não lança erro — cai na unidade que a conta enxerga. É a
    // escolha certa porque o cookie fica velho de forma legítima (quando
    // alguém perde acesso a uma unidade), e errar em toda página seria pior
    // do que seguir na unidade certa. Não há troca silenciosa: o cabeçalho
    // mostra sempre qual unidade está ativa.
    const { contagem, laguna } = await cenario();
    entrar("auth-operacional", laguna.id);

    const destino = await getActiveCompanyId("repasses-medicos");
    expect(destino).toBe(contagem.id);
    expect(destino).not.toBe(laguna.id);
  });

  it("BARRA o Operacional num módulo que o papel dele não alcança", async () => {
    const { contagem } = await cenario();
    entrar("auth-operacional", contagem.id);

    await expect(getActiveCompanyId("transacoes")).rejects.toThrow(/Transações/);
  });

  it("BARRA o Operacional de aprovar, mesmo no módulo que ele edita", async () => {
    const { contagem } = await cenario();
    entrar("auth-operacional", contagem.id);

    await expect(getActiveCompanyId("repasses-medicos", "editar")).resolves.toBe(contagem.id);
    await expect(getActiveCompanyId("repasses-medicos", "aprovar")).rejects.toThrow(/aprovar/);
  });

  it("a holding grava em qualquer unidade, inclusive sem linha de acesso", async () => {
    const { laguna } = await cenario();
    entrar("auth-holding", laguna.id);

    await expect(getActiveCompanyId("transacoes")).resolves.toBe(laguna.id);
  });
});

describe("as actions de verdade respeitam o papel", () => {
  it("Operacional lança repasse na unidade dele", async () => {
    const { contagem, doctor } = await cenario();
    entrar("auth-operacional", contagem.id);

    const r = await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      amount: 332,
      paid: false,
      lines: [],
    });

    expect(r.error).toBeUndefined();
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(1);
  });

  it("Operacional NÃO cria transação — e nada é gravado", async () => {
    const { contagem, conta } = await cenario();
    entrar("auth-operacional", contagem.id);

    const fd = new FormData();
    fd.set("date", "2026-08-14");
    fd.set("amount", "1000");
    fd.set("type", "INCOME");
    fd.set("description", "Tentativa indevida");
    fd.set("accountId", conta.id);

    const r = await createTransaction(undefined, fd);

    expect(r?.error).toMatch(/Transações/);
    await expect(testPrisma.transaction.count()).resolves.toBe(0);
  });

  it("com cookie forjado, o lançamento cai na unidade da conta e não na alheia", async () => {
    // O que importa aqui não é o erro, é ONDE o dado foi parar: em nenhuma
    // hipótese um Operacional de Contagem grava em Laguna.
    const { contagem, laguna, doctor } = await cenario();
    entrar("auth-operacional", laguna.id);

    const r = await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      amount: 332,
      paid: false,
      lines: [],
    });

    expect(r.error).toBeUndefined();
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    expect(entry.companyId).toBe(contagem.id);
    await expect(
      testPrisma.doctorDailyEntry.count({ where: { companyId: laguna.id } })
    ).resolves.toBe(0);
  });
});

describe("leitura: resolveCompanyIds", () => {
  it("no escopo consolidado, corta o que a conta não enxerga", async () => {
    // A metade de leitura da mesma correção. Sem ela, alguém sem acesso à
    // holding escolhia "todas as empresas" e o Balanço somava as unidades
    // que a conta não pode ver.
    const { contagem } = await cenario();
    entrar("auth-operacional", contagem.id);

    const todas = await resolveCompanyIds({ type: "all" });
    expect(todas).toEqual([contagem.id]);
  });

  it("a holding enxerga todas, inclusive as criadas depois", async () => {
    const { contagem, laguna } = await cenario();
    entrar("auth-holding", contagem.id);

    const nova = await testPrisma.company.create({ data: { name: "Unidade nova" } });
    const todas = await resolveCompanyIds({ type: "all" });

    expect(todas).toContain(contagem.id);
    expect(todas).toContain(laguna.id);
    expect(todas).toContain(nova.id);
  });
});

describe("menu", () => {
  it("mostra ao Operacional só as quatro telas do papel dele", async () => {
    const { contagem } = await cenario();
    entrar("auth-operacional", contagem.id);

    expect(await modulosVisiveis([contagem.id])).toEqual([
      "dashboard",
      "fechamento-caixa",
      "repasses-medicos",
      "medicos",
    ]);
  });

  it("mostra tudo à holding", async () => {
    const { contagem } = await cenario();
    entrar("auth-holding", contagem.id);

    const modulos = await modulosVisiveis([contagem.id]);
    expect(modulos).toContain("transacoes");
    expect(modulos).toContain("auditoria");
    expect(modulos).toContain("erros");
  });
});

describe("digitar o endereco de uma tela proibida", () => {
  it("o modulo da rota nao entra nos modulos visiveis do Operacional", async () => {
    // E disto que a guarda do layout se serve: se o modulo da rota pedida
    // nao esta na lista da conta, a tela nao renderiza — mesmo que a pessoa
    // tenha chegado digitando o endereco, sem passar pelo menu.
    const { contagem } = await cenario();
    entrar("auth-operacional", contagem.id);

    const permitidos = await modulosVisiveis([contagem.id]);
    for (const rota of ["/transacoes", "/balanco", "/operacao", "/contas", "/auditoria", "/erros"]) {
      const m = moduleOfPath(rota)!;
      expect(permitidos.includes(m), rota).toBe(false);
    }
    for (const rota of ["/dashboard", "/medicos", "/repasses-medicos", "/fechamento-caixa"]) {
      expect(permitidos.includes(moduleOfPath(rota)!), rota).toBe(true);
    }
  });
});

describe("cookie de escopo forjado", () => {
  it("nao da acesso a unidade alheia — cai na unidade da propria conta", async () => {
    // O cookie e dado do cliente. Antes, apontar para outra empresa passava
    // pela validacao (a empresa existe!) e as telas liam dela.
    const { contagem, laguna } = await cenario();
    entrar("auth-operacional", laguna.id);

    const scope = await getActiveScope();
    expect(scope).toEqual({ type: "company", companyId: contagem.id });
  });

  it("a holding continua alcancando qualquer unidade pelo cookie", async () => {
    const { laguna } = await cenario();
    entrar("auth-holding", laguna.id);

    expect(await getActiveScope()).toEqual({ type: "company", companyId: laguna.id });
  });
});
