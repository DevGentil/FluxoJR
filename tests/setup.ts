import { config } from "dotenv";
import { vi } from "vitest";

// revalidatePath/revalidateTag dependem do request-scope interno do Next.js,
// que não existe quando as server actions são chamadas direto (fora de uma
// request real) — são um efeito colateral de cache, irrelevante para o que
// os testes de integração verificam.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// cookies() também depende do request-scope interno do Next.js. Os testes
// chamam as actions sem nenhum cookie de escopo definido, então
// lib/scope.ts cai no fallback "primeira empresa" — igual ao comportamento
// de getDefaultCompany() de antes.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
  }),
}));

// Carrega .env (satisfaz a validação de lib/env.ts) e .env.test (fornece
// DATABASE_URL_TEST) antes de qualquer teste importar lib/prisma.ts. Não faz
// nada de banco aqui — testes unitários (que não tocam o banco) não devem
// pagar esse custo; cada teste de integração limpa o banco no seu próprio
// beforeEach (ver tests/helpers/db.ts).
config({ path: ".env" });
config({ path: ".env.test", override: true });

// Os testes de integração chamam as server actions diretamente (fora de uma
// request do Next.js), então `cookies()`/Supabase Auth não têm como funcionar
// aqui. Força o app a rodar em "modo aberto" nos testes — a lógica de negócio
// é testada aqui; a proteção via Supabase é responsabilidade do proxy.ts e do
// próprio Supabase, não desta suíte.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
