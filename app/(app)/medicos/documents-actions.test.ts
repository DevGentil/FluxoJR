import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { uploadDoctorDocument, deleteDoctorDocument } from "./documents-actions";

beforeEach(resetDb);

function form(arquivo: File | null, description: string) {
  const fd = new FormData();
  if (arquivo) fd.set("file", arquivo);
  fd.set("description", description);
  return fd;
}

const contrato = () => new File(["conteudo do contrato"], "contrato.pdf", { type: "application/pdf" });

async function seedDoctor(companyName = "Empresa") {
  const company = await testPrisma.company.create({ data: { name: companyName } });
  const doctor = await testPrisma.doctor.create({ data: { companyId: company.id, name: "Dra. Adriana" } });
  return { company, doctor };
}

describe("uploadDoctorDocument", () => {
  it("anexa o arquivo à ficha do médico", async () => {
    const { company, doctor } = await seedDoctor();

    const result = await uploadDoctorDocument(
      doctor.id,
      undefined,
      form(contrato(), "Contrato assinado em 01/2026")
    );

    expect(result?.error).toBeUndefined();
    const doc = await testPrisma.document.findFirstOrThrow();
    expect(doc).toMatchObject({
      doctorId: doctor.id,
      companyId: company.id,
      fileName: "contrato.pdf",
      mimeType: "application/pdf",
      description: "Contrato assinado em 01/2026",
    });
    expect(doc.size).toBeGreaterThan(0);
  });

  it("recusa sem arquivo", async () => {
    const { doctor } = await seedDoctor();

    const result = await uploadDoctorDocument(doctor.id, undefined, form(null, "Contrato"));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("recusa sem descrição — arquivo sem rótulo vira lixo em três meses", async () => {
    const { doctor } = await seedDoctor();

    const result = await uploadDoctorDocument(doctor.id, undefined, form(contrato(), "   "));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("recusa arquivo acima de 10MB", async () => {
    const { doctor } = await seedDoctor();
    const grande = new File([new Uint8Array(11 * 1024 * 1024)], "grande.pdf", { type: "application/pdf" });

    const result = await uploadDoctorDocument(doctor.id, undefined, form(grande, "Contrato"));

    expect(result?.error).toContain("10MB");
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("não anexa em médico de outra empresa", async () => {
    // getActiveCompanyId() cai na empresa mais antiga; o médico é da outra.
    await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const doctorB = await testPrisma.doctor.create({ data: { companyId: empresaB.id, name: "Dr. de B" } });

    const result = await uploadDoctorDocument(doctorB.id, undefined, form(contrato(), "Contrato"));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });
});

describe("deleteDoctorDocument", () => {
  it("exclui o anexo", async () => {
    const { doctor } = await seedDoctor();
    await uploadDoctorDocument(doctor.id, undefined, form(contrato(), "Contrato"));
    const doc = await testPrisma.document.findFirstOrThrow();

    const result = await deleteDoctorDocument(doc.id);

    expect(result?.error).toBeUndefined();
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("não alcança documento da EMPRESA por esta porta", async () => {
    // Documento sem doctorId pertence à empresa e se gerencia em Empresas.
    // Sem essa checagem, a ação do médico apagaria arquivos societários.
    const { company } = await seedDoctor();
    const daEmpresa = await testPrisma.document.create({
      data: {
        companyId: company.id,
        fileName: "contrato-social.pdf",
        mimeType: "application/pdf",
        size: 10,
        description: "Contrato social",
        content: Buffer.from("x"),
      },
    });

    const result = await deleteDoctorDocument(daEmpresa.id);

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.document.count()).resolves.toBe(1);
  });

  it("excluir o médico leva os anexos dele junto", async () => {
    const { doctor } = await seedDoctor();
    await uploadDoctorDocument(doctor.id, undefined, form(contrato(), "Contrato"));

    await testPrisma.doctor.delete({ where: { id: doctor.id } });

    await expect(testPrisma.document.count()).resolves.toBe(0);
  });
});
