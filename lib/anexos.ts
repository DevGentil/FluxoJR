import "server-only";
import { EXTENSOES, MAX_ANEXO_BYTES, MAX_ANEXOS, TIPOS_ACEITOS } from "@/lib/anexos-limites";

function tipoAceito(arquivo: File) {
  if (TIPOS_ACEITOS.includes(arquivo.type)) return true;
  // Sem mime confiável, decide pela extensão em vez de recusar um arquivo
  // que na verdade serve.
  const nome = arquivo.name.toLowerCase();
  return EXTENSOES.some((ext) => nome.endsWith(ext));
}

function formatarMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

/** Dados de um anexo prontos para virar `Document`. */
export interface AnexoPronto {
  fileName: string;
  mimeType: string;
  size: number;
  description: string;
  // `Buffer<ArrayBuffer>` e não só `Buffer`: o genérico solto vira
  // `ArrayBufferLike`, que inclui `SharedArrayBuffer` e o Prisma recusa.
  content: Buffer<ArrayBuffer>;
}

/** Lê os arquivos de um campo do formulário, valida e devolve prontos para
 * gravar. Lista vazia é resultado normal: anexar é opcional em todo lugar
 * onde isto é usado.
 *
 * A validação é refeita aqui mesmo o formulário já filtrando: o `accept`
 * do seletor é conveniência de tela, não barreira — qualquer POST pode
 * chegar sem passar por ele.
 *
 * Lança `Error` com mensagem para a pessoa — quem chama está dentro de
 * `runMutation`, que a transforma no aviso da tela. */
export async function lerAnexos(formData: FormData, campo: string): Promise<AnexoPronto[]> {
  const arquivos = formData
    .getAll(campo)
    .filter((v): v is File => v instanceof File && v.size > 0);

  if (arquivos.length === 0) return [];
  if (arquivos.length > MAX_ANEXOS) {
    throw new Error(`Anexe no máximo ${MAX_ANEXOS} arquivos por lançamento.`);
  }

  for (const arquivo of arquivos) {
    if (arquivo.size > MAX_ANEXO_BYTES) {
      throw new Error(
        `"${arquivo.name}" tem mais de ${formatarMB(MAX_ANEXO_BYTES)}. Reduza o arquivo e tente de novo.`
      );
    }
    if (!tipoAceito(arquivo)) {
      throw new Error(`"${arquivo.name}" não é um tipo aceito. Anexe PDF, XML da nota ou imagem.`);
    }
  }

  return Promise.all(
    arquivos.map(async (arquivo) => ({
      fileName: arquivo.name,
      mimeType: arquivo.type || "application/octet-stream",
      size: arquivo.size,
      // O nome do arquivo é a descrição. Pedir um rótulo a cada anexo
      // atrapalharia o lançamento diário, que é o caminho quente daqui.
      description: arquivo.name,
      content: Buffer.from(await arquivo.arrayBuffer()),
    }))
  );
}
