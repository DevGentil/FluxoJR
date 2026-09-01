/** Limites dos anexos, num arquivo sem `server-only` porque o formulário
 * precisa deles para filtrar o seletor e avisar o tamanho ANTES do envio.
 *
 * Ficam separados de `lib/anexos.ts` (que valida, e é só do servidor) para
 * a regra existir em um lugar só: o navegador orienta com estes números,
 * o servidor decide com estes mesmos números. */

/** Limite por arquivo, igual ao dos documentos de empresa e de médico. */
export const MAX_ANEXO_BYTES = 10 * 1024 * 1024;

/** Quantos arquivos cabem num lançamento. Nota e comprovante já são dois;
 * o teto existe para um clique errado no seletor não despejar a pasta
 * inteira dentro de uma transação. */
export const MAX_ANEXOS = 5;

/** O que se aceita anexar.
 *
 * PDF e imagem cobrem nota e comprovante do dia a dia. XML está aqui
 * porque a NF-e brasileira É um XML — recusá-lo obrigaria a imprimir a
 * nota em PDF só para conseguir guardá-la, que é o contrário do objetivo. */
export const TIPOS_ACEITOS = [
  "application/pdf",
  "application/xml",
  "text/xml",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

/** Extensões correspondentes, para o seletor de arquivos do navegador já
 * filtrar o que aparece — e para o caso do sistema operacional mandar o
 * arquivo sem mime nenhum, o que acontece com XML no Windows. */
export const EXTENSOES_ACEITAS = ".pdf,.xml,.jpg,.jpeg,.png,.webp,.heic";

export const EXTENSOES = [".pdf", ".xml", ".jpg", ".jpeg", ".png", ".webp", ".heic"];
