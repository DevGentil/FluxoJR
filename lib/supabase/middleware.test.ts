import { describe, expect, it } from "vitest";
import { ehPublica } from "./middleware";

describe("rotas que abrem sem sessão", () => {
  it("libera login e recuperação de senha, com as subrotas do fluxo", () => {
    for (const rota of [
      "/login",
      "/recuperar-senha",
      "/recuperar-senha/confirmar",
      "/recuperar-senha/definir",
    ]) {
      expect(ehPublica(rota), rota).toBe(true);
    }
  });

  it("mantém o resto do sistema fechado", () => {
    for (const rota of ["/", "/dashboard", "/transacoes", "/contas", "/trocar-senha"]) {
      expect(ehPublica(rota), rota).toBe(false);
    }
  });

  it("não confunde prefixo com rota — nada de /loginfalso abrir sozinho", () => {
    // A armadilha do startsWith puro: sem exigir a barra, qualquer rota
    // começada com o mesmo texto entraria de graça.
    for (const rota of ["/loginfalso", "/recuperar-senhas", "/recuperar-senha-x"]) {
      expect(ehPublica(rota), rota).toBe(false);
    }
  });
});
