import { describe, expect, it } from "vitest";
import { classificarGravidade } from "./erro-gravidade";

describe("gravidade do erro", () => {
  it("banco inacessível é crítico — ninguém trabalha até resolver", () => {
    expect(classificarGravidade("Can't reach database server at db.supabase.co:5432")).toBe("CRITICO");
    expect(classificarGravidade("connect ECONNREFUSED 127.0.0.1:5432")).toBe("CRITICO");
    expect(classificarGravidade("Error", "PrismaClientInitializationError: P1001")).toBe("CRITICO");
  });

  it("schema divergente é crítico — foi o que aconteceu de verdade aqui", () => {
    // Os 16 erros de 01/09: deploy do código antes da migração. A tela
    // inteira ficou fora, para todo mundo.
    expect(
      classificarGravidade("The column `Document.transactionId` does not exist in the current database.")
    ).toBe("CRITICO");
    expect(
      classificarGravidade("Unknown field `documents` for include statement on model `Transaction`.")
    ).toBe("CRITICO");
  });

  it("sessão e permissão são aviso, não defeito", () => {
    // Funcionou como devia. Chamar de erro faria o painel gritar por
    // comportamento correto, e o grito perde valor.
    expect(classificarGravidade("Sessão expirada. Faça login novamente.")).toBe("AVISO");
    expect(classificarGravidade("Somente a holding acessa os erros do sistema.")).toBe("AVISO");
    expect(classificarGravidade("Transações não faz parte do seu acesso")).toBe("AVISO");
  });

  it("requisição abandonada pelo navegador é aviso", () => {
    expect(classificarGravidade("The user aborted a request.")).toBe("AVISO");
  });

  it("o resto é ERRO — uma operação falhou", () => {
    expect(classificarGravidade("Cannot read properties of undefined (reading 'nome')")).toBe("ERRO");
    expect(classificarGravidade("Não foi possível salvar o fechamento.")).toBe("ERRO");
  });

  it("crítico vence aviso quando os dois batem", () => {
    // Um "não autorizado" que aconteceu PORQUE o banco caiu é problema de
    // banco. Classificar como aviso esconderia a queda.
    const misto = "Não autorizado.\nCan't reach database server";
    expect(classificarGravidade(misto)).toBe("CRITICO");
  });

  it("lê o código do Prisma na pilha, não só na mensagem", () => {
    // O texto legível fica na mensagem; o código costuma estar na pilha.
    expect(classificarGravidade("Invalid invocation", "code: 'P2022'")).toBe("CRITICO");
  });

  it("mensagem vazia não quebra a classificação", () => {
    expect(classificarGravidade("")).toBe("ERRO");
    expect(classificarGravidade("", null)).toBe("ERRO");
  });
});
