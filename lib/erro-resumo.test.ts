import { describe, expect, it } from "vitest";
import { resumirErro } from "./erro-resumo";

/** Uma mensagem do Prisma como ela chega de verdade: cabeçalho, caminho de
 * arquivo, recorte do código e, só no fim, a causa. */
const prismaReal = [
  "",
  "Invalid `prisma.transaction.findMany()` invocation in",
  "C:\Users\Davi\FluxoJR\.next\dev\server\chunks\ssr\algo.js:927:141",
  "",
  "  924 prisma.transaction.count({",
  "  925     where",
  "  926 }),",
  "→ 927 prisma.transaction.findMany({",
  "        include: {",
  "          documents: {",
  "          ~~~~~~~~~",
  "      ?   company?: true,",
  "        }",
  "      })",
  "Unknown field `documents` for include statement on model `Transaction`.",
].join("\n");

describe("resumo do erro", () => {
  it("mostra a CAUSA, não o cabeçalho da chamada", () => {
    // O ponto da função. O cabeçalho diz qual chamada falhou e nunca por
    // quê — três erros diferentes apareciam idênticos na lista.
    const resumo = resumirErro(prismaReal);
    expect(resumo).toBe("Unknown field `documents` for include statement on model `Transaction`.");
    expect(resumo).not.toMatch(/Invalid/);
  });

  it("descarta o recorte de código e o caminho do arquivo", () => {
    const resumo = resumirErro(prismaReal);
    expect(resumo).not.toMatch(/~~~/);
    expect(resumo).not.toMatch(/927/);
    expect(resumo).not.toMatch(/FluxoJR/);
  });

  it("erro comum: usa a primeira linha, que já é a mensagem", () => {
    expect(resumirErro("Sessão expirada. Faça login novamente.")).toBe(
      "Sessão expirada. Faça login novamente."
    );
  });

  it("corta o que é longo demais e sinaliza com reticências", () => {
    const longa = "E".repeat(400);
    const resumo = resumirErro(longa);
    expect(resumo.length).toBeLessThanOrEqual(120);
    expect(resumo.endsWith("…")).toBe(true);
  });

  it("não corta o que já cabe", () => {
    const curta = "Conta inválida.";
    expect(resumirErro(curta)).toBe(curta);
  });

  it("junta quebras de linha numa linha só", () => {
    expect(resumirErro("Falhou ao gravar")).toBe("Falhou ao gravar");
    expect(resumirErro("   Erro   com    espaços   ")).toBe("Erro com espaços");
  });

  it("mensagem vazia não quebra a tela", () => {
    expect(resumirErro("")).toBe("Erro sem mensagem.");
    expect(resumirErro("\n\n   \n")).toBe("Erro sem mensagem.");
  });
});
