import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createDoctor, updateDoctor, deleteDoctor, type DoctorInput } from "./doctors-actions";

beforeEach(resetDb);

async function seedItem(
  companyId: string,
  name = "Ultrassom",
  category: "CONSULTA" | "EXAME" | "PLANTAO" = "EXAME"
) {
  return testPrisma.serviceItem.create({ data: { companyId, name, category } });
}

function baseInput(serviceItemId: string, overrides: Partial<DoctorInput> = {}): DoctorInput {
  return {
    name: "Dr. João Silva",
    specialty: "Clínico Geral",
    document: "CRM 12345",
    paymentMethod: "PIX",
    active: true,
    serviceRates: [{ serviceItemId, rate: 45 }],
    ...overrides,
  };
}

describe("createDoctor", () => {
  it("cria o médico com o contrato de repasse", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const item = await seedItem(company.id);

    const result = await createDoctor(baseInput(item.id));

    expect(result.error).toBeUndefined();
    const doctors = await testPrisma.doctor.findMany({ include: { serviceRates: true } });
    expect(doctors).toHaveLength(1);
    expect(doctors[0]).toMatchObject({ name: "Dr. João Silva", document: "CRM 12345" });
    expect(doctors[0].serviceRates).toHaveLength(1);
    expect(Number(doctors[0].serviceRates[0].rate)).toBe(45);
  });

  it("aceita um médico que combina consulta, exame e plantão", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const consulta = await seedItem(company.id, "Consulta CT", "CONSULTA");
    const exame = await seedItem(company.id, "Raio-X", "EXAME");
    const plantao = await seedItem(company.id, "Plantão 10hrs", "PLANTAO");

    const result = await createDoctor(
      baseInput(consulta.id, {
        serviceRates: [
          { serviceItemId: consulta.id, rate: 32 },
          { serviceItemId: exame.id, rate: 5 },
          { serviceItemId: plantao.id, rate: 1800 },
        ],
      })
    );

    expect(result.error).toBeUndefined();
    const doctor = await testPrisma.doctor.findFirstOrThrow({ include: { serviceRates: true } });
    expect(doctor.serviceRates).toHaveLength(3);
  });

  it("marca a data de conferência ao cadastrar o contrato", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const item = await seedItem(company.id);

    await createDoctor(baseInput(item.id));

    const rate = await testPrisma.doctorServiceRate.findFirstOrThrow();
    expect(rate.lastCheckedAt).toBeInstanceOf(Date);
  });

  it("recusa sem nome", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const item = await seedItem(company.id);

    const result = await createDoctor(baseInput(item.id, { name: "" }));

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
  });

  it("recusa sem especialização", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const item = await seedItem(company.id);

    const result = await createDoctor(baseInput(item.id, { specialty: "" }));

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
  });

  it("recusa o mesmo item repetido no contrato", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const item = await seedItem(company.id);

    const result = await createDoctor(
      baseInput(item.id, {
        serviceRates: [
          { serviceItemId: item.id, rate: 45 },
          { serviceItemId: item.id, rate: 60 },
        ],
      })
    );

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
  });
});

describe("updateDoctor", () => {
  it("substitui o contrato inteiro", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const item = await seedItem(company.id, "Ultrassom");
    const item2 = await seedItem(company.id, "Raio-X");
    await createDoctor(baseInput(item.id));
    const doctor = await testPrisma.doctor.findFirstOrThrow();

    const result = await updateDoctor(
      doctor.id,
      baseInput(item.id, { serviceRates: [{ serviceItemId: item2.id, rate: 60 }] })
    );

    expect(result.error).toBeUndefined();
    const updated = await testPrisma.doctor.findUniqueOrThrow({
      where: { id: doctor.id },
      include: { serviceRates: true },
    });
    expect(updated.serviceRates).toHaveLength(1);
    expect(updated.serviceRates[0].serviceItemId).toBe(item2.id);
  });

  it("só reinicia a conferência do valor que mudou", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const mantido = await seedItem(company.id, "Ultrassom");
    const alterado = await seedItem(company.id, "Raio-X");
    await createDoctor(
      baseInput(mantido.id, {
        serviceRates: [
          { serviceItemId: mantido.id, rate: 45 },
          { serviceItemId: alterado.id, rate: 5 },
        ],
      })
    );
    const doctor = await testPrisma.doctor.findFirstOrThrow();

    // Recua a conferência de ambos para simular um contrato antigo.
    const antigo = new Date("2020-01-01T00:00:00Z");
    await testPrisma.doctorServiceRate.updateMany({ data: { lastCheckedAt: antigo } });

    await updateDoctor(
      doctor.id,
      baseInput(mantido.id, {
        serviceRates: [
          { serviceItemId: mantido.id, rate: 45 }, // igual
          { serviceItemId: alterado.id, rate: 8 }, // mudou
        ],
      })
    );

    const rates = await testPrisma.doctorServiceRate.findMany();
    const inalterado = rates.find((r) => r.serviceItemId === mantido.id)!;
    const novo = rates.find((r) => r.serviceItemId === alterado.id)!;
    expect(inalterado.lastCheckedAt?.getTime()).toBe(antigo.getTime());
    expect(novo.lastCheckedAt!.getTime()).toBeGreaterThan(antigo.getTime());
  });

  it("não afeta médico de outra empresa (escopo)", async () => {
    await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const itemB = await seedItem(empresaB.id);
    const doctorB = await testPrisma.doctor.create({
      data: { companyId: empresaB.id, name: "Dr. de B" },
    });

    // getActiveCompanyId() pega a empresa mais antiga — Empresa A nesse cenário.
    const result = await updateDoctor(doctorB.id, baseInput(itemB.id, { name: "Tentativa de invasão" }));

    expect(result.error).toBeTruthy();
    const unchanged = await testPrisma.doctor.findUniqueOrThrow({ where: { id: doctorB.id } });
    expect(unchanged.name).toBe("Dr. de B");
  });
});

describe("deleteDoctor", () => {
  it("exclui o médico e o contrato dele", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const item = await seedItem(company.id);
    await createDoctor(baseInput(item.id));
    const doctor = await testPrisma.doctor.findFirstOrThrow();

    const result = await deleteDoctor(doctor.id);

    expect(result.error).toBeUndefined();
    await expect(testPrisma.doctor.count()).resolves.toBe(0);
    await expect(testPrisma.doctorServiceRate.count()).resolves.toBe(0);
  });
});
