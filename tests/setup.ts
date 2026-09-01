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
// aqui. Força o app a rodar em "modo aberto", e por isso a maioria dos testes
// roda como se fosse a holding: eles verificam a REGRA DE NEGÓCIO, não quem
// pode executá-la.
//
// Quem verifica a permissão é `lib/access.test.ts`, que simula só a sessão e
// deixa `contaAtual`, a matriz de papéis e `getActiveCompanyId` rodarem de
// verdade. A separação é deliberada: sem ela, todo teste teria que carregar
// uma conta só para exercitar uma regra que não tem a ver com acesso.
//
// Vale o aviso: enquanto o controle de acesso não existia, o comentário aqui
// dizia que a proteção era "responsabilidade do Supabase". Deixou de ser —
// hoje ela mora em lib/permissions.ts, lib/access.ts e lib/scope.ts, e é
// coberta por esta suíte.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
