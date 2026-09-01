import { describe, expect, it } from "vitest";
import { lerAnexos } from "./anexos";
import { MAX_ANEXO_BYTES, MAX_ANEXOS } from "./anexos-limites";

function form(arquivos: File[], campo = "anexos") {
  const fd = new FormData();
  for (const a of arquivos) fd.append(campo, a);
  return fd;
}

function arquivo(nome: string, tipo: string, bytes = 10) {
  return new File([new Uint8Array(bytes)], nome, { type: tipo });
}

describe("leitura dos anexos", () => {
  it("campo vazio devolve lista vazia — anexar é opcional", async () => {
    await expect(lerAnexos(new FormData(), "anexos")).resolves.toEqual([]);
  });

  it("ignora o campo de arquivo que o navegador manda vazio", async () => {
    // Um <input type=file> sem escolha nenhuma ainda chega no FormData,
    // como um File de zero byte. Se isso virasse anexo, toda transação
    // salva sem arquivo ganharia um documento vazio.
    const vazio = new File([], "", { type: "application/octet-stream" });
    await expect(lerAnexos(form([vazio]), "anexos")).resolves.toEqual([]);
  });

  it("aceita PDF, XML da nota e imagem", async () => {
    const anexos = await lerAnexos(
      form([
        arquivo("nota.pdf", "application/pdf"),
        arquivo("nfe.xml", "text/xml"),
        arquivo("comprovante.jpg", "image/jpeg"),
      ]),
      "anexos"
    );

    expect(anexos.map((a) => a.fileName)).toEqual(["nota.pdf", "nfe.xml", "comprovante.jpg"]);
    expect(anexos[0].content).toBeInstanceOf(Buffer);
    expect(anexos[0].description).toBe("nota.pdf");
  });

  it("aceita pela extensão quando o sistema não informa o tipo", async () => {
    // Acontece com XML no Windows: o mime chega vazio. Recusar aí faria a
    // NF-e — que É um XML — ficar de fora do sistema sem motivo.
    const anexos = await lerAnexos(form([arquivo("nfe.XML", "")]), "anexos");
    expect(anexos).toHaveLength(1);
  });

  it("recusa tipo que não serve para nota nem comprovante", async () => {
    await expect(
      lerAnexos(form([arquivo("planilha.xlsx", "application/vnd.ms-excel")]), "anexos")
    ).rejects.toThrow(/não é um tipo aceito/);
  });

  it("recusa arquivo acima do limite, dizendo qual", async () => {
    const grande = arquivo("gigante.pdf", "application/pdf", MAX_ANEXO_BYTES + 1);
    await expect(lerAnexos(form([grande]), "anexos")).rejects.toThrow(/"gigante\.pdf" tem mais de 10MB/);
  });

  it("recusa mais anexos que o teto por lançamento", async () => {
    const muitos = Array.from({ length: MAX_ANEXOS + 1 }, (_, i) =>
      arquivo(`nota-${i}.pdf`, "application/pdf")
    );
    await expect(lerAnexos(form(muitos), "anexos")).rejects.toThrow(/no máximo/);
  });

  it("um anexo ruim invalida o lote inteiro", async () => {
    // Nada de gravar metade: se o segundo arquivo é recusado, o primeiro
    // não pode entrar sozinho e deixar a pessoa achando que anexou os dois.
    await expect(
      lerAnexos(form([arquivo("ok.pdf", "application/pdf"), arquivo("virus.exe", "application/x-msdownload")]), "anexos")
    ).rejects.toThrow(/virus.exe/);
  });
});
