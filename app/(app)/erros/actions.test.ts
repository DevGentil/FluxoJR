import { beforeEach, describe, expect, it, vi } from "vitest";

/** Quem está logado. A tela inteira é da holding, então é o que decide. */
const sessao = { holding: true };

vi.mock("@/lib/access", () => ({
  contaAtual: async () => (sessao.holding ? { holding: true } : { holding: false }),
}));

import { resetDb, testPrisma } from "@/tests/helpers/db";
import { DIAS_ANTIGO } from "./constantes";
import {
  excluirAntigos,
  excluirErro,
  excluirErros,
  excluirFiltrados,
} from "./actions";

beforeEach(async () => {
  await resetDb();
  sessao.holding = true;
});

function diasAtras(dias: number) {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

async function registrar(message: string, at: Date, seen = false) {
  return testPrisma.errorLog.create({ data: { message, at, seen } });
}

async function mensagensRestantes() {
  const linhas = await testPrisma.errorLog.findMany({ orderBy: { message: "asc" } });
  return linhas.map((l) => l.message);
}

describe("apagar um registro", () => {
  it("apaga só o escolhido", async () => {
    const alvo = await registrar("erro A", new Date());
    await registrar("erro B", new Date());

    expect(await excluirErro(alvo.id)).toBeUndefined();
    expect(await mensagensRestantes()).toEqual(["erro B"]);
  });

  it("id que não existe avisa em vez de fingir sucesso", async () => {
    const r = await excluirErro("id-inventado");
    expect(r?.error).toMatch(/não encontrado/);
  });
});

describe("apagar selecionados", () => {
  it("apaga exatamente os marcados", async () => {
    const a = await registrar("erro A", new Date());
    await registrar("erro B", new Date());
    const c = await registrar("erro C", new Date());

    expect(await excluirErros([a.id, c.id])).toBeUndefined();
    expect(await mensagensRestantes()).toEqual(["erro B"]);
  });

  it("lista vazia avisa em vez de apagar tudo", async () => {
    // A falha perigosa: um `deleteMany` com `in: []` sem guarda apagaria
    // ou nada ou tudo, dependendo do driver. O aviso torna explícito.
    await registrar("erro A", new Date());
    const r = await excluirErros([]);
    expect(r?.error).toMatch(/Nenhum registro selecionado/);
    expect(await mensagensRestantes()).toEqual(["erro A"]);
  });
});

describe("apagar antigos", () => {
  it("leva o que passou do prazo e PRESERVA o recente", async () => {
    // O ponto do teste. Uma limpeza que leva junto o erro de ontem apaga
    // justamente o que alguém ainda ia investigar.
    await registrar("antigo", diasAtras(DIAS_ANTIGO + 1));
    await registrar("bem antigo", diasAtras(365));
    await registrar("recente", diasAtras(1));
    await registrar("de hoje", new Date());

    expect(await excluirAntigos()).toBeUndefined();
    expect(await mensagensRestantes()).toEqual(["de hoje", "recente"]);
  });

  it("não poupa o antigo só por estar sem ver", async () => {
    // Filtrar por `seen` faria a limpeza deixar para trás exatamente o
    // lixo mais velho — o que ninguém olhou e já não vai olhar.
    await registrar("antigo nao visto", diasAtras(90), false);

    expect(await excluirAntigos()).toBeUndefined();
    expect(await mensagensRestantes()).toEqual([]);
  });

  it("sem nada antigo, avisa e não mexe no resto", async () => {
    await registrar("recente", diasAtras(2));
    const r = await excluirAntigos();
    expect(r?.error).toMatch(new RegExp(`${DIAS_ANTIGO} dias`));
    expect(await mensagensRestantes()).toEqual(["recente"]);
  });
});

describe("apagar o que o filtro alcanca", () => {
  it("sem filtro, esvazia o registro inteiro", async () => {
    await registrar("a", diasAtras(400));
    await registrar("b", new Date());

    expect(await excluirFiltrados({})).toBeUndefined();
    expect(await mensagensRestantes()).toEqual([]);
  });

  it("com filtro de gravidade, poupa o resto", async () => {
    // O ponto: "Selecionar tudo" com o filtro em Critico nao pode levar
    // junto os avisos que a pessoa nem esta vendo.
    await testPrisma.errorLog.create({ data: { message: "critico", severity: "CRITICO" } });
    await testPrisma.errorLog.create({ data: { message: "aviso", severity: "AVISO" } });

    expect(await excluirFiltrados({ gravidade: "CRITICO" })).toBeUndefined();
    expect(await mensagensRestantes()).toEqual(["aviso"]);
  });

  it("com filtro de estado, poupa o resto", async () => {
    await registrar("visto", new Date(), true);
    await registrar("novo", new Date(), false);

    expect(await excluirFiltrados({ estado: "vistos" })).toBeUndefined();
    expect(await mensagensRestantes()).toEqual(["novo"]);
  });

  it("gravidade inventada na URL nao vira filtro que apaga demais", async () => {
    // O valor vem do endereco, que e dado de fora. Se passasse cru para o
    // Prisma, a consulta quebraria; se fosse ignorado em silencio sem
    // validar, um erro de digitacao apagaria tudo achando que filtrou.
    await testPrisma.errorLog.create({ data: { message: "critico", severity: "CRITICO" } });
    await testPrisma.errorLog.create({ data: { message: "aviso", severity: "AVISO" } });

    await excluirFiltrados({ gravidade: "CATASTROFE" });
    // Sem gravidade valida, o filtro cai para "tudo" — que e o mesmo que o
    // botao "Todos" mostra, entao bate com o que a tela dizia.
    expect(await mensagensRestantes()).toEqual([]);
  });

  it("registro ja vazio avisa em vez de dizer que apagou", async () => {
    const r = await excluirFiltrados({});
    expect(r?.error).toMatch(/Não há registros/);
  });
});

describe("quem não é da holding", () => {
  it("não apaga nada, por nenhum dos caminhos", async () => {
    // Erro de aplicação expõe caminho de arquivo e consulta do banco. Só
    // quem mantém o sistema mexe aqui — nem para ler, nem para apagar.
    const erro = await registrar("erro A", diasAtras(90));
    sessao.holding = false;

    for (const acao of [
      () => excluirErro(erro.id),
      () => excluirErros([erro.id]),
      () => excluirAntigos(),
      () => excluirFiltrados({}),
    ]) {
      const r = await acao();
      expect(r?.error).toMatch(/holding/);
    }

    expect(await mensagensRestantes()).toEqual(["erro A"]);
  });
});
