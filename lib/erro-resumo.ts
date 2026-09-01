/** Quantos caracteres o resumo pode ter antes de virar reticências.
 * Cabe numa linha na maioria das telas sem cortar cedo demais. */
const LIMITE = 120;

/** Linhas que são recorte de código, não explicação.
 *
 * O Prisma imprime o trecho do arquivo em volta do erro — numeradas, com
 * seta, til e interrogação. Isso ajuda quem vai depurar e atrapalha quem
 * só quer saber o que quebrou. */
function ehRecorteDeCodigo(linha: string) {
  return (
    /^→?\s*\d+\s/.test(linha) || // "924 prisma.transaction.count({" ou "→ 927 ..."
    /^[~^?\s]+$/.test(linha) || // "~~~~~~~~~" e "^"
    /^\?\s/.test(linha) || // "? company?: true,"
    /^[A-Za-z]:\\/.test(linha) || // caminho de arquivo do Windows
    /^\/(home|Users|var|app)\//.test(linha) // e do Linux/macOS
  );
}

/** O cabeçalho do Prisma diz QUAL chamada falhou, nunca POR QUÊ — o motivo
 * vem no fim da mensagem, depois do recorte de código. */
function ehCabecalhoDeInvocacao(linha: string) {
  return /^Invalid .*invocation/.test(linha);
}

/** Reduz a mensagem de erro a uma linha que diz o que aconteceu.
 *
 * Existe porque a mensagem crua do Prisma tem quinze linhas: cabeçalho,
 * caminho do arquivo, o trecho do código e só então a causa. Na lista, o
 * cabeçalho ocupava a linha inteira e era justamente a parte que não
 * informa nada — três erros diferentes apareciam idênticos.
 *
 * A mensagem completa não some: ela passa a ser mostrada ao abrir o
 * registro. Aqui é só a vitrine. */
export function resumirErro(message: string): string {
  const linhas = message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !ehRecorteDeCodigo(l));

  if (linhas.length === 0) return "Erro sem mensagem.";

  // Com cabeçalho de invocação, a causa é a última linha; sem ele, a
  // primeira linha já é a mensagem.
  const escolhida = ehCabecalhoDeInvocacao(linhas[0])
    ? (linhas.at(-1) as string)
    : linhas[0];

  const limpa = escolhida.replace(/\s+/g, " ").trim();
  return limpa.length > LIMITE ? `${limpa.slice(0, LIMITE - 1).trimEnd()}…` : limpa;
}
