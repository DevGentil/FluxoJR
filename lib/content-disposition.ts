/** Monta o cabeçalho `Content-Disposition` de um download.
 *
 * O parâmetro `filename` só aceita ASCII e o navegador o usa como está — por
 * isso "Relatório Agosto.pdf" percent-encodado virava literalmente
 * "Relat%C3%B3rio%20Agosto.pdf" no disco do usuário. O nome com acento vai no
 * `filename*` (RFC 5987), e o `filename` fica como fallback ASCII para
 * clientes antigos, que é exatamente a ordem que a RFC 6266 recomenda. */
export function attachmentHeader(fileName: string): string {
  const ascii = fileName
    // Decompõe o acento e joga fora o diacrítico: "ó" -> "o".
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // Sobrou algo fora do ASCII imprimível (ou aspas/barra, que quebram o
    // cabeçalho)? Vira "_", para não gerar um header inválido.
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");

  const fallback = ascii.trim() || "download";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
