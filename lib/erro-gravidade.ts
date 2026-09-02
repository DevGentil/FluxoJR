/** Quão grave é o erro, do ponto de vista de quem vai agir.
 *
 * São três porque três é o que muda a decisão: largar tudo, entrar na
 * fila, ou ignorar. Uma escala de cinco faria o meio virar despejo. */
export const GRAVIDADES = ["CRITICO", "ERRO", "AVISO"] as const;

export type Gravidade = (typeof GRAVIDADES)[number];

export const GRAVIDADE_ROTULO: Record<Gravidade, string> = {
  CRITICO: "Crítico",
  ERRO: "Erro",
  AVISO: "Aviso",
};

export const GRAVIDADE_DESCRICAO: Record<Gravidade, string> = {
  CRITICO: "O sistema está fora para todo mundo — banco inacessível ou schema divergente.",
  ERRO: "Uma operação falhou. Afeta quem estava fazendo aquilo, não o sistema todo.",
  AVISO: "Esperado: sessão vencida, acesso negado, requisição abandonada.",
};

/** Sinais de que o sistema inteiro está fora, não uma operação.
 *
 * São os casos em que ninguém consegue trabalhar até alguém agir: o banco
 * não responde, ou o código está pedindo coluna que o banco não tem — o
 * que acontece quando o deploy sobe sem a migração. */
const CRITICOS = [
  /P1000|P1001|P1002|P1008|P1017/, // autenticação, timeout e conexão com o banco
  /P2021|P2022/, // tabela ou coluna que não existe
  /does not exist in the current database/i,
  /Unknown field .* for (include|select) statement/i,
  /Can't reach database server/i,
  /Connection (refused|terminated|reset)/i,
  /too many connections/i,
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/,
  /JavaScript heap out of memory/i,
];

/** O que é esperado e não indica defeito.
 *
 * Registrar é útil (mostra tentativa de acesso indevido, por exemplo), mas
 * chamar de erro faria o painel gritar por coisa que funcionou como devia. */
const AVISOS = [
  /Sessão expirada/i,
  /Faça login novamente/i,
  /Não autorizado/i,
  /Somente a holding/i,
  /não faz parte do seu acesso/i,
  /sem permissão/i,
  /NEXT_REDIRECT|NEXT_NOT_FOUND/,
  /aborted|The user aborted a request|ResponseAborted/i,
  /ECONNRESET/,
];

function algumBate(padroes: RegExp[], texto: string) {
  return padroes.some((p) => p.test(texto));
}

/** Classifica um erro capturado.
 *
 * Olha mensagem e pilha juntas porque o código do Prisma (`P2022`) às vezes
 * só aparece na pilha, enquanto o texto legível fica na mensagem.
 *
 * A ordem importa: crítico vence aviso. Um "não autorizado" que aconteceu
 * porque o banco caiu é problema de banco, não de permissão. */
export function classificarGravidade(message: string, stack?: string | null): Gravidade {
  const texto = `${message ?? ""}\n${stack ?? ""}`;

  if (algumBate(CRITICOS, texto)) return "CRITICO";
  if (algumBate(AVISOS, texto)) return "AVISO";
  return "ERRO";
}
