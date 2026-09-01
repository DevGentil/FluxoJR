import { beforeEach, describe, expect, it, vi } from "vitest";

/** O que o Supabase devolveu, e o que ele recebeu. */
const supabase = {
  erro: null as { status?: number } | null,
  chamadas: [] as { email: string; redirectTo?: string }[],
};

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: true,
  createClient: async () => ({
    auth: {
      resetPasswordForEmail: async (email: string, opts?: { redirectTo?: string }) => {
        supabase.chamadas.push({ email, redirectTo: opts?.redirectTo });
        return { error: supabase.erro };
      },
    },
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://fluxo.jr" }),
}));

import { pedirRecuperacao } from "./actions";

beforeEach(() => {
  supabase.erro = null;
  supabase.chamadas = [];
});

function pedir(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return pedirRecuperacao(undefined, fd);
}

describe("pedir recuperação de senha", () => {
  it("não revela se o e-mail existe: a resposta é a mesma nos dois casos", async () => {
    // A propriedade que importa aqui. Se a conta inexistente respondesse
    // diferente, esta tela viraria um verificador de quem trabalha na
    // holding — bastaria ir testando endereços até um deles reagir.
    const cadastrado = await pedir("davi@holding.com");

    // O Supabase responde igual para e-mail desconhecido; o que não pode é
    // o nosso código introduzir a diferença que ele evita.
    const desconhecido = await pedir("ninguem@lugar-nenhum.com");

    expect(cadastrado).toEqual({ enviado: true });
    expect(desconhecido).toEqual(cadastrado);
  });

  it("aponta o link para o handler que troca o token por sessão", async () => {
    await pedir("davi@holding.com");
    expect(supabase.chamadas[0]?.redirectTo).toBe("https://fluxo.jr/recuperar-senha/confirmar");
  });

  it("normaliza o e-mail antes de enviar", async () => {
    await pedir("  Davi@Holding.COM  ");
    expect(supabase.chamadas[0]?.email).toBe("davi@holding.com");
  });

  it("recusa e-mail inválido sem chamar o Supabase", async () => {
    expect(await pedir("nao-e-email")).toEqual({ error: "Informe um e-mail válido." });
    expect(supabase.chamadas).toHaveLength(0);
  });

  it("avisa quando o limite de tentativas foi atingido", async () => {
    // Este é o único erro dito em voz alta: fala de quem está pedindo, não
    // de quem existe, então não vaza nada — e sem ele a pessoa tentaria de
    // novo achando que não funcionou.
    supabase.erro = { status: 429 };
    const r = await pedir("davi@holding.com");
    expect(r?.error).toMatch(/Muitas tentativas/);
    expect(r?.enviado).toBeUndefined();
  });

  it("erro qualquer do Supabase não vira pista sobre a conta", async () => {
    supabase.erro = { status: 400 };
    expect(await pedir("davi@holding.com")).toEqual({ enviado: true });
  });
});
