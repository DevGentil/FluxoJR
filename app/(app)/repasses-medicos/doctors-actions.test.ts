import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createDoctor, updateDoctor, deleteDoctor, type DoctorInput } from "./doctors-actions";

beforeEach(resetDb);

async function seedServiceItem(companyId: string, name = "Ultrassom") {
  return testPrisma.serviceItem.create({ data: { companyId, name } });
}

function baseInput(serviceItemId: string, overrides: Partial<DoctorInput> = {}): DoctorInput {
  return {
    name: "Dr. João Silva",
    specialty: "Clínico Geral",
    document: "CRM 12345",
    paymentMethod: "PIX",
    paymentModel: "CONSULTATION_AND_EXAM",
    consultationRate: 80,
    active: true,
    serviceRates: [{ serviceItemId, rate: 45 }],
    ...overrides,
  };
}

describe("createDoctor", () => {
  it("cria o médico com as taxas de exame", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const serviceItem = await seedServiceItem(company.id);

    const result = await createDoctor(baseInput(serviceItem.id));

    expect(result.error).toBeUndefined();
    const doctors = await testPrisma.doctor.findMany({ include: { serviceRates: true } });
    expect(doctors).toHaveLength(1);
    expect(doctors[0]).toMatchObject({ name: "Dr. João Silva", document: "CRM 12345" });
    expect(Number(doctors[0].consultationRate)).toBe(80);
    expect(doctors[0].serviceRates).toHaveLength(1);
    expect(Number(doctors[0].serviceRates[0].rate)).toBe(45);
  });

  it("recusa sem nome", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const serviceItem = await seedServiceItem(company.id);

    const result = await createDoctor(baseInput(serviceItem.id, { name: "" }));

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
  });

  it("recusa sem especialização", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const serviceItem = await seedServiceItem(company.id);

    const result = await createDoctor(baseInput(serviceItem.id, { specialty: "" }));

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
  });

  it("cria médico HOURLY (plantão) sem consultationRate nem serviceRates", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const serviceItem = await seedServiceItem(company.id);

    const result = await createDoctor(
      baseInput(serviceItem.id, {
        paymentModel: "HOURLY",
        consultationRate: undefined,
        hourlyRate: 150,
        serviceRates: [{ serviceItemId: serviceItem.id, rate: 45 }], // deve ser ignorado
      })
    );

    expect(result.error).toBeUndefined();
    const doctor = await testPrisma.doctor.findFirstOrThrow({ include: { serviceRates: true } });
    expect(doctor.consultationRate).toBeNull();
    expect(Number(doctor.hourlyRate)).toBe(150);
    expect(doctor.serviceRates).toHaveLength(0);
  });

  it("recusa médico HOURLY sem valor por hora", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const serviceItem = await seedServiceItem(company.id);

    const result = await createDoctor(
      baseInput(serviceItem.id, { paymentModel: "HOURLY", consultationRate: undefined, hourlyRate: undefined })
    );

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
  });
});

describe("updateDoctor", () => {
  it("substitui as taxas de exame (upsert completo)", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const serviceItem = await seedServiceItem(company.id, "Ultrassom");
    const serviceItem2 = await seedServiceItem(company.id, "Raio-X");
    await createDoctor(baseInput(serviceItem.id));
    const doctor = await testPrisma.doctor.findFirstOrThrow();

    const result = await updateDoctor(
      doctor.id,
      baseInput(serviceItem.id, { consultationRate: 100, serviceRates: [{ serviceItemId: serviceItem2.id, rate: 60 }] })
    );

    expect(result.error).toBeUndefined();
    const updated = await testPrisma.doctor.findUniqueOrThrow({
      where: { id: doctor.id },
      include: { serviceRates: true },
    });
    expect(Number(updated.consultationRate)).toBe(100);
    expect(updated.serviceRates).toHaveLength(1);
    expect(updated.serviceRates[0].serviceItemId).toBe(serviceItem2.id);
  });

  it("não afeta médico de outra empresa (escopo)", async () => {
    await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const serviceItemB = await seedServiceItem(empresaB.id);
    const doctorB = await testPrisma.doctor.create({
      data: { companyId: empresaB.id, name: "Dr. de B", consultationRate: 50 },
    });

    // getActiveCompanyId() pega a empresa mais antiga — Empresa A nesse cenário.
    const result = await updateDoctor(doctorB.id, baseInput(serviceItemB.id, { name: "Tentativa de invasão" }));

    expect(result.error).toBeTruthy();
    const unchanged = await testPrisma.doctor.findUniqueOrThrow({ where: { id: doctorB.id } });
    expect(unchanged.name).toBe("Dr. de B");
  });
});

describe("deleteDoctor", () => {
  it("exclui o médico e suas taxas de exame", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const serviceItem = await seedServiceItem(company.id);
    await createDoctor(baseInput(serviceItem.id));
    const doctor = await testPrisma.doctor.findFirstOrThrow();

    const result = await deleteDoctor(doctor.id);

    expect(result.error).toBeUndefined();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
    await expect(testPrisma.doctorServiceRate.count()).resolves.toBe(0);
  });
});
