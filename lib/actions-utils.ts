import type { z } from "zod";

export type ActionState = { error?: string } | undefined;

/** Extrai e valida um FormData contra um schema zod, num formato pronto para
 * usar como retorno antecipado das server actions: `if ("error" in result) return result;` */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData
): { data: z.infer<S> } | { error: string } {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  return { data: parsed.data };
}

/** Roda uma mutation e converte qualquer erro em ActionState amigável, em vez
 * de deixar a exceção estourar até a tela de erro genérica do Next. */
export async function runMutation(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Não foi possível concluir a operação." };
  }
}
