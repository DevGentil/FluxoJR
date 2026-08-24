import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório."),
    NEXT_PUBLIC_SUPABASE_URL: z.string().optional().default(""),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().default(""),
  })
  .refine(
    (env) => Boolean(env.NEXT_PUBLIC_SUPABASE_URL) === Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      message:
        "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY devem ser configurados juntos (ou nenhum dos dois, para rodar em modo aberto).",
      path: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    }
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => issue.message).join("\n");
  throw new Error(`Configuração de ambiente inválida (.env):\n${message}`);
}

export const env = parsed.data;
