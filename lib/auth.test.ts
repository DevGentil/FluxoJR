import { afterEach, describe, expect, it, vi } from "vitest";

/** O modo aberto roda o app sem login, para desenvolvimento local.
 *
 * Estes testes existem por causa de uma falha real: ele ligava sozinho só
 * por `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` estarem
 * ausentes. Um deploy com a variável errada, renomeada ou não propagada
 * derrubava o middleware que protege as rotas E fazia `requireUser()`
 * devolver `null` para todo mundo — o sistema ficaria público na internet,
 * em silêncio, sem um erro sequer no log.
 *
 * A correção foi somar o `NODE_ENV` à condição. O teste existe para que ela
 * não volte atrás sem alguém perceber: quem mexer nessa linha vai ver estes
 * casos falharem.
 *
 * `MODO_ABERTO` é uma constante de módulo, avaliada na importação — por isso
 * cada caso reimporta o módulo com o ambiente já trocado. */
async function carregarComAmbiente(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  return import("./auth");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("MODO_ABERTO", () => {
  it("liga fora de produção quando não há Supabase configurado", async () => {
    const { MODO_ABERTO } = await carregarComAmbiente({
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    expect(MODO_ABERTO).toBe(true);
  });

  it("NÃO liga em produção, mesmo sem Supabase configurado", async () => {
    // O caso que motivou a correção. Se este teste falhar, um deploy sem as
    // variáveis volta a expor o sistema inteiro.
    const { MODO_ABERTO } = await carregarComAmbiente({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    expect(MODO_ABERTO).toBe(false);
  });

  it("não liga quando o Supabase está configurado, em ambiente nenhum", async () => {
    for (const NODE_ENV of ["development", "test", "production"]) {
      const { MODO_ABERTO } = await carregarComAmbiente({
        NODE_ENV,
        NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-anonima",
      });
      expect(MODO_ABERTO, `NODE_ENV=${NODE_ENV}`).toBe(false);
    }
  });
});

describe("requireUser em produção sem autenticação configurada", () => {
  it("recusa em vez de deixar passar", async () => {
    // A outra metade: mesmo que alguém remova o MODO_ABERTO da equação,
    // `requireUser` não pode devolver "sem usuário, tudo bem".
    const { requireUser } = await carregarComAmbiente({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    await expect(requireUser()).rejects.toThrow(/Autenticação não configurada/i);
  });
});
