import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import {
  createDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
  toggleDailyEntryPaid,
} from "./daily-entries-actions";
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
          { serviceItemId: consulta.id, rate: 24 },
          { serviceItemId: exame.id, rate: 45 },
        ],
      },
    },
  });
  return { company, consulta, exame, doctor };
}

describe("createDailyEntry", () => {
  it("aceita só o valor do dia, como a planilha faz na maioria dos dias", async () => {
    const { doctor } = await seedDoctorWithContract();

    const result = await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      amount: 332,
      paid: false,
      lines: [],
    });

    expect(result.error).toBeUndefined();
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow({ include: { lines: true } });
    expect(Number(entry.amount)).toBe(332);
    expect(entry.lines).toHaveLength(0);
    expect(entry.paid).toBe(false);
  });

  it("detalhando por item, congela a taxa contratada e descarta o valor digitado", async () => {
    const { doctor, consulta, exame } = await seedDoctorWithContract();

    const result = await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      // Mesmo com valor digitado, o detalhe manda: 8 x 24 + 2 x 45 = 282.
      amount: 999,
      paid: false,
      lines: [
        { serviceItemId: consulta.id, quantity: 8 },
        { serviceItemId: exame.id, quantity: 2 },
      ],
    });

    expect(result.error).toBeUndefined();
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow({ include: { lines: true } });
    expect(entry.amount).toBeNull();
    expect(entry.lines).toHaveLength(2);

    const linhaConsulta = entry.lines.find((l) => l.serviceItemId === consulta.id)!;
    expect(Number(linhaConsulta.quantity)).toBe(8);
    expect(Number(linhaConsulta.rate)).toBe(24);
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

    // 9,5 horas a R$180 = R$1.710, o lançamento real do plantonista.
    const result = await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      paid: false,
      lines: [{ serviceItemId: plantao.id, quantity: 9.5 }],
    });

    expect(result.error).toBeUndefined();
    const line = await testPrisma.doctorDailyLine.findFirstOrThrow();
    expect(Number(line.quantity)).toBe(9.5);
    expect(Number(line.rate)).toBe(180);
  });

  it("permite dois lançamentos do mesmo médico no mesmo dia", async () => {
    // Acontece de verdade: manhã e tarde lançadas separadas em 7 casos das
    // planilhas. O modelo antigo, mensal, impedia isso.
    const { doctor } = await seedDoctorWithContract();
    const base = { doctorId: doctor.id, date: "2026-08-14", paid: false, lines: [] };

    await createDailyEntry({ ...base, amount: 332 });
    const result = await createDailyEntry({ ...base, amount: 210 });

    expect(result.error).toBeUndefined();
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(2);
  });

  it("recusa item que o médico não tem contratado", async () => {
    const { company, doctor } = await seedDoctorWithContract();
    const semContrato = await testPrisma.serviceItem.create({
      data: { companyId: company.id, name: "Raio-X", category: "EXAME" },
    });

    const result = await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      paid: false,
      lines: [{ serviceItemId: semContrato.id, quantity: 2 }],
    });

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(0);
  });

  it("recusa lançamento sem valor e sem detalhe", async () => {
    const { doctor } = await seedDoctorWithContract();

    const result = await createDailyEntry({ doctorId: doctor.id, date: "2026-08-14", paid: false, lines: [] });

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(0);
  });

  it("recusa o mesmo item repetido no mesmo dia", async () => {
    const { doctor, consulta } = await seedDoctorWithContract();

    const result = await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      paid: false,
      lines: [
        { serviceItemId: consulta.id, quantity: 4 },
        { serviceItemId: consulta.id, quantity: 4 },
      ],
    });

    expect(result.error).toBeTruthy();
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(0);
  });
});

describe("updateDailyEntry", () => {
  it("não recalcula sozinho quando o contrato muda depois (fica congelado até editar)", async () => {
    const { doctor, consulta } = await seedDoctorWithContract();
    await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      paid: false,
      lines: [{ serviceItemId: consulta.id, quantity: 10 }],
    });
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();

    // O contrato do médico muda depois do lançamento.
    await testPrisma.doctorServiceRate.updateMany({
      where: { doctorId: doctor.id, serviceItemId: consulta.id },
      data: { rate: 34 },
    });

    const untouched = await testPrisma.doctorDailyLine.findFirstOrThrow();
    expect(Number(untouched.rate)).toBe(24);

    // Editar o lançamento busca a taxa ATUAL e recongela.
    const result = await updateDailyEntry(entry.id, {
      doctorId: doctor.id,
      date: "2026-08-14",
      paid: false,
      lines: [{ serviceItemId: consulta.id, quantity: 10 }],
    });
    expect(result.error).toBeUndefined();
    const updated = await testPrisma.doctorDailyLine.findFirstOrThrow();
    expect(Number(updated.rate)).toBe(34);
  });

  it("troca o detalhe pelo valor do dia e limpa as linhas", async () => {
    const { doctor, consulta } = await seedDoctorWithContract();
    await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      paid: false,
      lines: [{ serviceItemId: consulta.id, quantity: 10 }],
    });
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();

    const result = await updateDailyEntry(entry.id, {
      doctorId: doctor.id,
      date: "2026-08-14",
      amount: 300,
      paid: true,
      lines: [],
    });

    expect(result.error).toBeUndefined();
    const updated = await testPrisma.doctorDailyEntry.findFirstOrThrow({ include: { lines: true } });
    expect(Number(updated.amount)).toBe(300);
    expect(updated.lines).toHaveLength(0);
    expect(updated.paid).toBe(true);
  });
});

describe("toggleDailyEntryPaid", () => {
  it("dá baixa sem mexer no resto do lançamento", async () => {
    const { doctor } = await seedDoctorWithContract();
    await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      amount: 332,
      paid: false,
      lines: [],
    });
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();

    const result = await toggleDailyEntryPaid(entry.id, true);

    expect(result.error).toBeUndefined();
    const updated = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    expect(updated.paid).toBe(true);
    expect(Number(updated.amount)).toBe(332);
  });
});

describe("deleteDailyEntry", () => {
  it("exclui o lançamento e suas linhas", async () => {
    const { doctor, consulta, exame } = await seedDoctorWithContract();
    await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      paid: false,
      lines: [
        { serviceItemId: consulta.id, quantity: 10 },
        { serviceItemId: exame.id, quantity: 5 },
      ],
    });
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();

    const result = await deleteDailyEntry(entry.id);

    expect(result.error).toBeUndefined();
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(0);
    await expect(testPrisma.doctorDailyLine.count()).resolves.toBe(0);
  });
});

describe("deleteServiceItem", () => {
  it("recusa excluir item com repasses lançados", async () => {
    const { doctor, exame } = await seedDoctorWithContract();
    await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      paid: false,
      lines: [{ serviceItemId: exame.id, quantity: 5 }],
    });

    const result = await deleteServiceItem(exame.id);

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.serviceItem.count()).resolves.toBe(2);
  });
});
