import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createDoctor, updateDoctor, deleteDoctor, type DoctorInput } from "./doctors-actions";

beforeEach(resetDb);

async function seedExamType(companyId: string, name = "Ultrassom") {
  return testPrisma.examType.create({ data: { companyId, name } });
}

function baseInput(examTypeId: string, overrides: Partial<DoctorInput> = {}): DoctorInput {
  return {
    name: "Dr. João Silva",
    document: "CRM 12345",
    paymentMethod: "PIX",
    consultationRate: 80,
    active: true,
    examRates: [{ examTypeId, rate: 45 }],
    ...overrides,
  };
}

describe("createDoctor", () => {
  it("cria o médico com as taxas de exame", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const examType = await seedExamType(company.id);

    const result = await createDoctor(baseInput(examType.id));

    expect(result.error).toBeUndefined();
    const doctors = await testPrisma.doctor.findMany({ include: { examRates: true } });
    expect(doctors).toHaveLength(1);
    expect(doctors[0]).toMatchObject({ name: "Dr. João Silva", document: "CRM 12345" });
    expect(Number(doctors[0].consultationRate)).toBe(80);
    expect(doctors[0].examRates).toHaveLength(1);
    expect(Number(doctors[0].examRates[0].rate)).toBe(45);
  });

  it("recusa sem nome", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const examType = await seedExamType(company.id);

    const result = await createDoctor(baseInput(examType.id, { name: "" }));

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
  });
});

describe("updateDoctor", () => {
  it("substitui as taxas de exame (upsert completo)", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const examType = await seedExamType(company.id, "Ultrassom");
    const examType2 = await seedExamType(company.id, "Raio-X");
    await createDoctor(baseInput(examType.id));
    const doctor = await testPrisma.doctor.findFirstOrThrow();

    const result = await updateDoctor(
      doctor.id,
      baseInput(examType.id, { consultationRate: 100, examRates: [{ examTypeId: examType2.id, rate: 60 }] })
    );

    expect(result.error).toBeUndefined();
    const updated = await testPrisma.doctor.findUniqueOrThrow({
      where: { id: doctor.id },
      include: { examRates: true },
    });
    expect(Number(updated.consultationRate)).toBe(100);
    expect(updated.examRates).toHaveLength(1);
    expect(updated.examRates[0].examTypeId).toBe(examType2.id);
  });

  it("não afeta médico de outra empresa (escopo)", async () => {
    await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const examTypeB = await seedExamType(empresaB.id);
    const doctorB = await testPrisma.doctor.create({
      data: { companyId: empresaB.id, name: "Dr. de B", consultationRate: 50 },
    });

    // getActiveCompanyId() pega a empresa mais antiga — Empresa A nesse cenário.
    const result = await updateDoctor(doctorB.id, baseInput(examTypeB.id, { name: "Tentativa de invasão" }));

    expect(result.error).toBeTruthy();
    const unchanged = await testPrisma.doctor.findUniqueOrThrow({ where: { id: doctorB.id } });
    expect(unchanged.name).toBe("Dr. de B");
  });
});

describe("deleteDoctor", () => {
  it("exclui o médico e suas taxas de exame", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const examType = await seedExamType(company.id);
    await createDoctor(baseInput(examType.id));
    const doctor = await testPrisma.doctor.findFirstOrThrow();

    const result = await deleteDoctor(doctor.id);

    expect(result.error).toBeUndefined();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
    await expect(testPrisma.doctorExamRate.count()).resolves.toBe(0);
  });
});
