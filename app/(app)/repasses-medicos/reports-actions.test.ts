import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createPeriodReport, updatePeriodReport, deletePeriodReport } from "./reports-actions";
import { deleteServiceItem } from "./service-items-actions";

beforeEach(resetDb);

/** Médico com contrato de consulta + exame, o caso mais comum. */
async function seedDoctorWithContract() {
  const company = await testPrisma.company.create({ data: { name: "Empresa" } });
  const consulta = await testPrisma.serviceItem.create({
    data: { companyId: company.id, name: "Consulta CT", category: "CONSULTA" },
  });
  const exame = await testPrisma.serviceItem.create({
    data: { companyId: company.id, name: "Ultrassom", category: "EXAME" },
  });
  const doctor = await testPrisma.doctor.create({
    data: {
      companyId: company.id,
      name: "Dr. João Silva",
      serviceRates: {
        create: [
          { serviceItemId: consulta.id, rate: 80 },
          { serviceItemId: exame.id, rate: 45 },
        ],
      },
    },
  });
  return { company, consulta, exame, doctor };
}

describe("createPeriodReport", () => {
  it("cria o lançamento congelando a taxa contratada de cada item", async () => {
    const { doctor, consulta, exame } = await seedDoctorWithContract();

    const result = await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      lines: [
        { serviceItemId: consulta.id, quantity: 40 },
        { serviceItemId: exame.id, quantity: 10 },
      ],
    });

    expect(result.error).toBeUndefined();
    const reports = await testPrisma.doctorPeriodReport.findMany({ include: { lines: true } });
    expect(reports).toHaveLength(1);
    expect(reports[0].lines).toHaveLength(2);

    const linhaConsulta = reports[0].lines.find((l) => l.serviceItemId === consulta.id)!;
    expect(Number(linhaConsulta.quantity)).toBe(40);
    expect(Number(linhaConsulta.rate)).toBe(80);
  });

  it("aceita quantidade fracionada (horas de plantão)", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const plantao = await testPrisma.serviceItem.create({
      data: { companyId: company.id, name: "Plantão por hora", category: "PLANTAO" },
    });
    const doctor = await testPrisma.doctor.create({
      data: {
        companyId: company.id,
        name: "Dr. Plantonista",
        serviceRates: { create: [{ serviceItemId: plantao.id, rate: 180 }] },
      },
    });

    const result = await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      lines: [{ serviceItemId: plantao.id, quantity: 40.5 }],
    });

    expect(result.error).toBeUndefined();
    const line = await testPrisma.doctorPeriodLine.findFirstOrThrow();
    expect(Number(line.quantity)).toBe(40.5);
    expect(Number(line.rate)).toBe(180);
  });

  it("recusa item que o médico não tem contratado", async () => {
    const { company, doctor } = await seedDoctorWithContract();
    const semContrato = await testPrisma.serviceItem.create({
      data: { companyId: company.id, name: "Raio-X", category: "EXAME" },
    });

    const result = await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      lines: [{ serviceItemId: semContrato.id, quantity: 2 }],
    });

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctorPeriodReport.count()).resolves.toBe(0);
  });

  it("recusa lançamento sem nenhuma linha", async () => {
    const { doctor } = await seedDoctorWithContract();

    const result = await createPeriodReport({ doctorId: doctor.id, competencia: "2026-08", lines: [] });

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctorPeriodReport.count()).resolves.toBe(0);
  });

  it("recusa dois repasses do mesmo médico no mesmo mês", async () => {
    const { doctor, consulta } = await seedDoctorWithContract();
    await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      lines: [{ serviceItemId: consulta.id, quantity: 20 }],
    });

    const result = await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      lines: [{ serviceItemId: consulta.id, quantity: 30 }],
    });

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctorPeriodReport.count()).resolves.toBe(1);
  });
});

describe("updatePeriodReport", () => {
  it("não recalcula sozinho quando o contrato muda depois (fica congelado até editar)", async () => {
    const { doctor, consulta } = await seedDoctorWithContract();
    await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      lines: [{ serviceItemId: consulta.id, quantity: 10 }],
    });
    const report = await testPrisma.doctorPeriodReport.findFirstOrThrow();

    // O contrato do médico muda depois do lançamento.
    await testPrisma.doctorServiceRate.updateMany({
      where: { doctorId: doctor.id, serviceItemId: consulta.id },
      data: { rate: 200 },
    });

    const untouched = await testPrisma.doctorPeriodLine.findFirstOrThrow();
    expect(Number(untouched.rate)).toBe(80);

    // Editar o lançamento busca a taxa ATUAL e recongela.
    const result = await updatePeriodReport(report.id, {
      doctorId: doctor.id,
      competencia: "2026-08",
      lines: [{ serviceItemId: consulta.id, quantity: 10 }],
    });
    expect(result.error).toBeUndefined();
    const updated = await testPrisma.doctorPeriodLine.findFirstOrThrow();
    expect(Number(updated.rate)).toBe(200);
  });
});

describe("deletePeriodReport", () => {
  it("exclui o lançamento e suas linhas", async () => {
    const { doctor, consulta, exame } = await seedDoctorWithContract();
    await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      lines: [
        { serviceItemId: consulta.id, quantity: 10 },
        { serviceItemId: exame.id, quantity: 5 },
      ],
    });
    const report = await testPrisma.doctorPeriodReport.findFirstOrThrow();

    const result = await deletePeriodReport(report.id);

    expect(result.error).toBeUndefined();
    await expect(testPrisma.doctorPeriodReport.count()).resolves.toBe(0);
    await expect(testPrisma.doctorPeriodLine.count()).resolves.toBe(0);
  });
});

describe("deleteServiceItem", () => {
  it("recusa excluir item com repasses lançados", async () => {
    const { doctor, exame } = await seedDoctorWithContract();
    await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      lines: [{ serviceItemId: exame.id, quantity: 5 }],
    });

    const result = await deleteServiceItem(exame.id);

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.serviceItem.count()).resolves.toBe(2);
  });
});
