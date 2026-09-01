import { describe, expect, it } from "vitest";
import {
  MODULES,
  ROLES,
  can,
  levelFor,
  nivelAtinge,
  visibleModules,
  type Access,
  type Role,
} from "./permissions";

const conta = (role: Role | null, holding = false): Access => ({ holding, role });

const OPERACIONAL = conta("OPERACIONAL");
const FINANCEIRO = conta("FINANCEIRO");
const GESTOR = conta("GESTOR");
const HOLDING = conta(null, true);
const SEM_ACESSO = conta(null);

describe("nivelAtinge", () => {
  it("os níveis são cumulativos", () => {
    expect(nivelAtinge("aprovar", "editar")).toBe(true);
    expect(nivelAtinge("editar", "ver")).toBe(true);
    expect(nivelAtinge("ver", "ver")).toBe(true);
  });

  it("não sobe de nível", () => {
    expect(nivelAtinge("ver", "editar")).toBe(false);
    expect(nivelAtinge("editar", "aprovar")).toBe(false);
    expect(nivelAtinge("nenhum", "ver")).toBe(false);
  });
});

describe("conta da holding", () => {
  it("aprova em todos os módulos, sem exceção", () => {
    for (const m of MODULES) expect(levelFor(HOLDING, m)).toBe("aprovar");
  });

  it("não depende de linha de acesso por empresa", () => {
    // O ponto do desenho: a diretoria enxerga a unidade nova no dia em que
    // ela é cadastrada, sem ninguém precisar lembrar de dar acesso.
    expect(HOLDING.role).toBeNull();
    expect(can(HOLDING, "balanco", "aprovar")).toBe(true);
  });
});

describe("conta sem acesso à empresa", () => {
  it("não enxerga nada", () => {
    for (const m of MODULES) expect(levelFor(SEM_ACESSO, m)).toBe("nenhum");
    expect(visibleModules(SEM_ACESSO)).toEqual([]);
  });

  it("papel nulo não é papel vazio", () => {
    // Uma conta que existe mas não foi vinculada a esta empresa tem que dar
    // o mesmo resultado de uma conta desconhecida.
    expect(can(SEM_ACESSO, "dashboard")).toBe(false);
  });
});

describe("Operacional", () => {
  it("lança o dia a dia da unidade", () => {
    expect(can(OPERACIONAL, "fechamento-caixa", "editar")).toBe(true);
    expect(can(OPERACIONAL, "repasses-medicos", "editar")).toBe(true);
  });

  it("edita o contrato do médico, valores inclusive", () => {
    // Decisão da operação em 30/08/2026: quem lança também define o valor.
    expect(can(OPERACIONAL, "medicos", "editar")).toBe(true);
  });

  it("não aprova repasse — o aval é do financeiro para cima", () => {
    expect(can(OPERACIONAL, "repasses-medicos", "aprovar")).toBe(false);
  });

  it("não chega no dinheiro da empresa nem nos cadastros", () => {
    expect(can(OPERACIONAL, "transacoes")).toBe(false);
    expect(can(OPERACIONAL, "contas-a-pagar-receber")).toBe(false);
    expect(can(OPERACIONAL, "contas-bancarias")).toBe(false);
    expect(can(OPERACIONAL, "empresas")).toBe(false);
  });

  it("vê exatamente quatro telas, na ordem do menu", () => {
    expect(visibleModules(OPERACIONAL)).toEqual([
      "dashboard",
      "fechamento-caixa",
      "repasses-medicos",
      "medicos",
    ]);
  });
});

describe("Financeiro", () => {
  it("aprova o repasse", () => {
    expect(can(FINANCEIRO, "repasses-medicos", "aprovar")).toBe(true);
  });

  it("faz tudo que o Operacional faz", () => {
    for (const m of MODULES) {
      if (can(OPERACIONAL, m, "editar")) expect(can(FINANCEIRO, m, "editar")).toBe(true);
    }
  });

  it("movimenta o dinheiro e mantém os cadastros", () => {
    expect(can(FINANCEIRO, "transacoes", "editar")).toBe(true);
    expect(can(FINANCEIRO, "contas-a-pagar-receber", "editar")).toBe(true);
    expect(can(FINANCEIRO, "categorias", "editar")).toBe(true);
    expect(can(FINANCEIRO, "fornecedores", "editar")).toBe(true);
    expect(can(FINANCEIRO, "contas-bancarias", "editar")).toBe(true);
    expect(can(FINANCEIRO, "empresas", "editar")).toBe(true);
  });

  it("vê Balanço mas NÃO vê Operação", () => {
    // A única diferença entre Financeiro e Gestor. O resultado da unidade é
    // do financeiro; a rentabilidade por procedimento é do gestor.
    expect(can(FINANCEIRO, "balanco")).toBe(true);
    expect(can(FINANCEIRO, "operacao")).toBe(false);
  });
});

describe("Gestor", () => {
  it("enxerga a unidade inteira", () => {
    // "erros" fica de fora: e modulo do SISTEMA, nao da unidade. Erro de
    // aplicacao e assunto de quem mantem o software, e quem mantem e a
    // holding — por completo que seja o acesso do gestor na unidade dele.
    const daUnidade = MODULES.filter((m) => m !== "erros");
    for (const m of daUnidade) expect(can(GESTOR, m, "ver")).toBe(true);
    expect(can(GESTOR, "erros")).toBe(false);
  });

  it("faz tudo que o Financeiro faz", () => {
    for (const m of MODULES) {
      if (can(FINANCEIRO, m, "aprovar")) expect(can(GESTOR, m, "aprovar")).toBe(true);
      if (can(FINANCEIRO, m, "editar")) expect(can(GESTOR, m, "editar")).toBe(true);
    }
  });

  it("só a holding enxerga os erros do sistema", () => {
    expect(can(HOLDING, "erros")).toBe(true);
    for (const role of ROLES) expect(can(conta(role), "erros")).toBe(false);
  });

  it("difere do Financeiro só em Operação e na gestão de contas", () => {
    const diferencas = MODULES.filter((m) => levelFor(GESTOR, m) !== levelFor(FINANCEIRO, m));
    expect(diferencas).toEqual(["operacao", "contas"]);
  });

  it("é quem gerencia acesso, junto com a holding", () => {
    expect(can(GESTOR, "contas", "editar")).toBe(true);
    expect(can(FINANCEIRO, "contas")).toBe(false);
    expect(can(OPERACIONAL, "contas")).toBe(false);
  });
});

describe("a matriz inteira", () => {
  it("todo papel tem nível declarado em todo módulo", () => {
    // Sem isso, um módulo novo entraria com `undefined` — que não é
    // "nenhum", e passaria a comparação de nível de forma imprevisível.
    for (const role of ROLES) {
      for (const m of MODULES) {
        expect(levelFor(conta(role), m)).toBeTypeOf("string");
      }
    }
  });

  it("todo papel enxerga o Dashboard", () => {
    for (const role of ROLES) expect(can(conta(role), "dashboard")).toBe(true);
  });

  it("ninguém além da holding aprova fora de repasse", () => {
    // Hoje "aprovar" só existe para o aval do repasse. Se um dia outro
    // módulo ganhar aprovação, este teste falha e obriga a decisão a ser
    // consciente em vez de acidental.
    for (const role of ROLES) {
      const aprovaveis = MODULES.filter((m) => levelFor(conta(role), m) === "aprovar");
      expect(aprovaveis.every((m) => m === "repasses-medicos")).toBe(true);
    }
  });
});
