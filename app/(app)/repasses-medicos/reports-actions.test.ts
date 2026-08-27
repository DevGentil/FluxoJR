import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createPeriodReport, updatePeriodReport, deletePeriodReport } from "./reports-actions";
import { deleteExamType } from "./exam-types-actions";

beforeEach(resetDb);

async function seedDoctorWithRates() {
  const company = await testPrisma.company.create({ data: { name: "Empresa" } });
  const examType = await testPrisma.examType.create({ data: { companyId: company.id, name: "Ultrassom" } });
  const doctor = await testPrisma.doctor.create({
    data: {
      companyId: company.id,
      name: "Dr. João Silva",
      consultationRate: 80,
      examRates: { create: [{ examTypeId: examType.id, rate: 45 }] },
    },
  });
  return { company, examType, doctor };
}

describe("createPeriodReport", () => {
  it("cria o repasse congelando a taxa de consulta e a de exame", async () => {
    const { doctor, examType } = await seedDoctorWithRates();

    const result = await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      consultationCount: 40,
      examCounts: [{ examTypeId: examType.id, count: 10 }],
    });

    expect(result.error).toBeUndefined();
    const reports = await testPrisma.doctorPeriodReport.findMany({ include: { examCounts: true } });
    expect(reports).toHaveLength(1);
    expect(reports[0].consultationCount).toBe(40);
    expect(Number(reports[0].consultationRate)).toBe(80);
    expect(reports[0].examCounts).toHaveLength(1);
    expect(reports[0].examCounts[0].count).toBe(10);
    expect(Number(reports[0].examCounts[0].rate)).toBe(45);
  });

  it("recusa exame sem taxa cadastrada pro médico", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const examType = await testPrisma.examType.create({ data: { companyId: company.id, name: "Raio-X" } });
    const doctor = await testPrisma.doctor.create({
      data: { companyId: company.id, name: "Dr. Sem Taxas", consultationRate: 80 },
    });

    const result = await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      consultationCount: 10,
      examCounts: [{ examTypeId: examType.id, count: 2 }],
    });

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctorPeriodReport.count()).resolves.toBe(0);
  });

  it("recusa dois repasses do mesmo médico no mesmo mês", async () => {
    const { doctor } = await seedDoctorWithRates();
    await createPeriodReport({ doctorId: doctor.id, competencia: "2026-08", consultationCount: 20, examCounts: [] });

    const result = await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      consultationCount: 30,
      examCounts: [],
    });

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctorPeriodReport.count()).resolves.toBe(1);
  });
});

describe("updatePeriodReport", () => {
  it("não recalcula sozinho quando a taxa do médico muda depois (fica congelado até editar)", async () => {
    const { doctor, examType } = await seedDoctorWithRates();
    await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      consultationCount: 10,
      examCounts: [{ examTypeId: examType.id, count: 5 }],
    });
    const report = await testPrisma.doctorPeriodReport.findFirstOrThrow();

    // Taxa do médico muda depois do lançamento.
    await testPrisma.doctor.update({ where: { id: doctor.id }, data: { consultationRate: 200 } });

    const untouched = await testPrisma.doctorPeriodReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(Number(untouched.consultationRate)).toBe(80);

    // Editar o repasse busca a taxa ATUAL do médico e recongela.
    const result = await updatePeriodReport(report.id, {
      doctorId: doctor.id,
      competencia: "2026-08",
      consultationCount: 10,
      examCounts: [{ examTypeId: examType.id, count: 5 }],
    });
    expect(result.error).toBeUndefined();
    const updated = await testPrisma.doctorPeriodReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(Number(updated.consultationRate)).toBe(200);
  });
});

describe("deletePeriodReport", () => {
  it("exclui o repasse e suas linhas de exame", async () => {
    const { doctor, examType } = await seedDoctorWithRates();
    await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      consultationCount: 10,
      examCounts: [{ examTypeId: examType.id, count: 5 }],
    });
    const report = await testPrisma.doctorPeriodReport.findFirstOrThrow();

    const result = await deletePeriodReport(report.id);

    expect(result.error).toBeUndefined();
    await expect(testPrisma.doctorPeriodReport.count()).resolves.toBe(0);
    await expect(testPrisma.doctorPeriodExamCount.count()).resolves.toBe(0);
  });
});

describe("deleteExamType", () => {
  it("recusa excluir tipo de exame com repasses lançados", async () => {
    const { examType, doctor } = await seedDoctorWithRates();
    await createPeriodReport({
      doctorId: doctor.id,
      competencia: "2026-08",
      consultationCount: 10,
      examCounts: [{ examTypeId: examType.id, count: 5 }],
    });

    const result = await deleteExamType(examType.id);

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.examType.count()).resolves.toBe(1);
  });
});
