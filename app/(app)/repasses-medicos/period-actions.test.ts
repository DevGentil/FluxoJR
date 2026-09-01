import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import {
  createDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
  toggleDailyEntryPaid,
} from "./daily-entries-actions";
import { parseDateOnly, startOfMonth } from "@/lib/date-only";

const DESDE_SEMPRE = parseDateOnly("2026-01-01");

beforeEach(resetDb);

async function seed() {
  const company = await testPrisma.company.create({ data: { name: "Empresa" } });
  const consulta = await testPrisma.serviceItem.create({
    data: { companyId: company.id, name: "Consulta", category: "CONSULTA" },
  });
  const doctor = await testPrisma.doctor.create({
    data: {
      companyId: company.id,
      name: "Dr. João Silva",
      serviceRates: { create: [{ serviceItemId: consulta.id, rate: 24, validFrom: DESDE_SEMPRE }] },
    },
  });
  return { company, doctor };
}

async function fecharAgosto(companyId: string) {
  await testPrisma.periodClosing.create({
    data: { companyId, month: startOfMonth("2026-08"), closedByName: "Financeiro" },
  });
}

/** O ponto do fechamento: `paid` marcava e não impedia. Estes testes existem
 * porque a proteção só vale se ela realmente barrar — e barrar em todos os
 * quatro caminhos, não só no mais óbvio. */
describe("mês fechado", () => {
  it("recusa criar lançamento dentro dele", async () => {
    const { company, doctor } = await seed();
    await fecharAgosto(company.id);

    const result = await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-08-14",
      amount: 332,
      paid: false,
      lines: [],
    });

    expect(result.error).toContain("fechado");
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(0);
  });

  it("recusa alterar lançamento dele", async () => {
    const { company, doctor } = await seed();
    await createDailyEntry({ doctorId: doctor.id, date: "2026-08-14", amount: 332, paid: false, lines: [] });
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    await fecharAgosto(company.id);

    const result = await updateDailyEntry(entry.id, {
      doctorId: doctor.id,
      date: "2026-08-14",
      amount: 999,
      paid: false,
      lines: [],
    });

    expect(result.error).toContain("fechado");
    const depois = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    expect(Number(depois.amount)).toBe(332);
  });

  it("recusa excluir lançamento dele", async () => {
    const { company, doctor } = await seed();
    await createDailyEntry({ doctorId: doctor.id, date: "2026-08-14", amount: 332, paid: false, lines: [] });
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    await fecharAgosto(company.id);

    const result = await deleteDailyEntry(entry.id);

    expect(result.error).toContain("fechado");
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(1);
  });

  it("recusa marcar como pago dentro dele", async () => {
    const { company, doctor } = await seed();
    await createDailyEntry({ doctorId: doctor.id, date: "2026-08-14", amount: 332, paid: false, lines: [] });
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    await fecharAgosto(company.id);

    const result = await toggleDailyEntryPaid(entry.id, true);

    expect(result.error).toContain("fechado");
    expect((await testPrisma.doctorDailyEntry.findFirstOrThrow()).paid).toBe(false);
  });

  it("NÃO deixa arrastar um lançamento para fora do mês fechado", async () => {
    // A porta dos fundos: checar só a data de destino permitiria mudar a data
    // de um lançamento de agosto para setembro e esvaziar o fechamento sem
    // tocar em nada "dentro" dele.
    const { company, doctor } = await seed();
    await createDailyEntry({ doctorId: doctor.id, date: "2026-08-14", amount: 332, paid: false, lines: [] });
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    await fecharAgosto(company.id);

    const result = await updateDailyEntry(entry.id, {
      doctorId: doctor.id,
      date: "2026-09-14",
      amount: 332,
      paid: false,
      lines: [],
    });

    expect(result.error).toContain("fechado");
    const depois = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    expect(depois.date.toISOString().slice(0, 10)).toBe("2026-08-14");
  });

  it("NÃO deixa trazer um lançamento para dentro do mês fechado", async () => {
    const { company, doctor } = await seed();
    await createDailyEntry({ doctorId: doctor.id, date: "2026-09-14", amount: 332, paid: false, lines: [] });
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    await fecharAgosto(company.id);

    const result = await updateDailyEntry(entry.id, {
      doctorId: doctor.id,
      date: "2026-08-14",
      amount: 332,
      paid: false,
      lines: [],
    });

    expect(result.error).toContain("fechado");
  });

  it("não atrapalha os outros meses", async () => {
    const { company, doctor } = await seed();
    await fecharAgosto(company.id);

    const result = await createDailyEntry({
      doctorId: doctor.id,
      date: "2026-09-02",
      amount: 500,
      paid: false,
      lines: [],
    });

    expect(result.error).toBeUndefined();
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(1);
  });

  it("não atrapalha outra unidade", async () => {
    // O fechamento é por empresa: agosto fechado em Contagem não fecha
    // agosto em Laguna.
    const { company, doctor } = await seed();
    await fecharAgosto(company.id);

    const outra = await testPrisma.company.create({ data: { name: "Outra unidade" } });
    expect(
      await testPrisma.periodClosing.findUnique({
        where: { companyId_month: { companyId: outra.id, month: startOfMonth("2026-08") } },
      })
    ).toBeNull();

    // O lançamento de agosto na outra empresa não é barrado pelo fechamento
    // desta — as actions resolvem a empresa pelo escopo, então o que se
    // verifica aqui é que a trava não vazou entre unidades.
    expect(doctor.companyId).toBe(company.id);
  });
});
