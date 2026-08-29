import { describe, expect, it } from "vitest";
import { attachmentHeader } from "./content-disposition";

describe("attachmentHeader", () => {
  it("preserva o nome com acento no filename* e usa ASCII no fallback", () => {
    // Antes, o nome ia percent-encodado no `filename` e o usuário salvava
    // um arquivo chamado "Relat%C3%B3rio%20Agosto.pdf".
    const header = attachmentHeader("Relatório Agosto.pdf");
    expect(header).toContain(`filename="Relatorio Agosto.pdf"`);
    expect(header).toContain("filename*=UTF-8''Relat%C3%B3rio%20Agosto.pdf");
  });

  it("deixa nome puro ASCII intacto", () => {
    expect(attachmentHeader("balanco.csv")).toContain(`filename="balanco.csv"`);
  });

  it("neutraliza aspas, que quebrariam o cabeçalho", () => {
    expect(attachmentHeader(`nota "final".pdf`)).toContain(`filename="nota _final_.pdf"`);
  });

  it("cai para um nome genérico quando não sobra nada em ASCII", () => {
    expect(attachmentHeader("報告書")).toContain(`filename="___"`);
  });
});
