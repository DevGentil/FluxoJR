import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { aprovarRepasse, reabrirRepasse } from "./payout-actions";
import { createDailyEntry, updateDailyEntry, deleteDailyEntry } from "./daily-entries-actions";

beforeEach(resetDb);

async function cenario() {
  const company = await testPrisma.company.create({ data: { name: "Empresa" } });
  await testPrisma.account.create({
    data: { companyId: company.id, name: "Conta Corrente", type: "Corrente", initialBalance: 0 },
  });
  const doctor = await testPrisma.doctor.create({
    data: { companyId: company.id, name: "Dra. Helane" },
  });
  return { company, doctor };
}

async function lancar(doctorId: string, date: string, amount: number) {
  return createDailyEntry({ doctorId, date, amount, paid: false, lines: [] });
}

describe("aprovação do repasse", () => {
  it("lançar NÃO cria transação — só a aprovação cria", async () => {
    // É a regra inteira em uma frase: o dia lançado documenta o trabalho;
    // quem decide que ele vira despesa é o financeiro.
    const { doctor } = await cenario();

    await lancar(doctor.id, "2026-08-10", 300);
    await lancar(doctor.id, "2026-08-14", 220);

    await expect(testPrisma.transaction.count()).resolves.toBe(0);
    await expect(testPrisma.doctorPayout.count()).resolves.toBe(0);
  });

  it("aprovar soma o mês num único lançamento de despesa", async () => {
    // Uma transação por dia poria milhares de linhas no razão para
    // representar um pagamento só.
    const { doctor } = await cenario();
    await lancar(doctor.id, "2026-08-10", 300);
    await lancar(doctor.id, "2026-08-14", 220);

    const r = await aprovarRepasse(doctor.id, "2026-08");

    expect(r?.error).toBeUndefined();
    const transacoes = await testPrisma.transaction.findMany();
    expect(transacoes).toHaveLength(1);
    expect(transacoes[0].type).toBe("EXPENSE");
    expect(Number(transacoes[0].amount)).toBe(520);
    expect(transacoes[0].description).toMatch(/Dra\. Helane/);
  });

  it("a despesa fica no ÚLTIMO dia do mês, não em hoje", async () => {
    // Datá-la em "hoje" jogaria a despesa de agosto no resultado de
    // setembro, e o mês fechado deixaria de bater.
    const { doctor } = await cenario();
    await lancar(doctor.id, "2026-08-10", 300);

    await aprovarRepasse(doctor.id, "2026-08");

    const t = await testPrisma.transaction.findFirstOrThrow();
    expect(t.date.toISOString().slice(0, 7)).toBe("2026-08");
  });

  it("só o mês pedido entra", async () => {
    const { doctor } = await cenario();
    await lancar(doctor.id, "2026-08-31", 100);
    await lancar(doctor.id, "2026-09-01", 900);

    await aprovarRepasse(doctor.id, "2026-08");

    const t = await testPrisma.transaction.findFirstOrThrow();
    expect(Number(t.amount)).toBe(100);
  });

  it("aprovar de novo não duplica: só o que ficou de fora entra", async () => {
    // Dia esquecido lançado depois da aprovação é caso real. A segunda
    // aprovação cobre a diferença em vez de repetir o mês inteiro.
    const { doctor } = await cenario();
    await lancar(doctor.id, "2026-08-10", 300);
    await aprovarRepasse(doctor.id, "2026-08");

    await lancar(doctor.id, "2026-08-20", 50);
    const segunda = await aprovarRepasse(doctor.id, "2026-08");

    expect(segunda?.error).toBeUndefined();
    const total = (await testPrisma.transaction.findMany()).reduce((s, t) => s + Number(t.amount), 0);
    expect(total).toBe(350);
  });

  it("sem nada pendente, avisa em vez de criar lançamento vazio", async () => {
    const { doctor } = await cenario();
    const r = await aprovarRepasse(doctor.id, "2026-08");
    expect(r?.error).toMatch(/Não há lançamentos pendentes/);
  });

  it("marca quem aprovou", async () => {
    const { doctor } = await cenario();
    await lancar(doctor.id, "2026-08-10", 300);

    await aprovarRepasse(doctor.id, "2026-08");

    const payout = await testPrisma.doctorPayout.findFirstOrThrow();
    expect(payout.approvedAt).not.toBeNull();
    expect(Number(payout.amount)).toBe(300);
  });
});

describe("lançamento já aprovado", () => {
  async function aprovado() {
    const { doctor } = await cenario();
    await lancar(doctor.id, "2026-08-10", 300);
    await aprovarRepasse(doctor.id, "2026-08");
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    return { doctor, entry };
  }

  it("não pode ser editado", async () => {
    // Editar por baixo deixaria a transação do mês diferente da soma dos
    // dias que a pessoa vê na tela.
    const { doctor, entry } = await aprovado();

    const r = await updateDailyEntry(entry.id, {
      doctorId: doctor.id,
      date: "2026-08-10",
      amount: 9999,
      paid: false,
      lines: [],
    });

    expect(r.error).toMatch(/Reabra antes/);
    const salvo = await testPrisma.doctorDailyEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(Number(salvo.amount)).toBe(300);
  });

  it("não pode ser excluído", async () => {
    const { entry } = await aprovado();

    const r = await deleteDailyEntry(entry.id);

    expect(r.error).toMatch(/Reabra antes/);
    await expect(testPrisma.doctorDailyEntry.count()).resolves.toBe(1);
  });
});

describe("reabrir o repasse", () => {
  it("tira a despesa do resultado e devolve os dias à edição", async () => {
    const { doctor } = await cenario();
    await lancar(doctor.id, "2026-08-10", 300);
    await aprovarRepasse(doctor.id, "2026-08");
    const payout = await testPrisma.doctorPayout.findFirstOrThrow();

    const r = await reabrirRepasse(payout.id);

    expect(r?.error).toBeUndefined();
    await expect(testPrisma.transaction.count()).resolves.toBe(0);
    await expect(testPrisma.doctorPayout.count()).resolves.toBe(0);

    // Os lançamentos continuam lá, apenas sem repasse.
    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    expect(entry.payoutId).toBeNull();
    expect(Number(entry.amount)).toBe(300);
  });

  it("depois de reabrir, editar volta a funcionar", async () => {
    const { doctor } = await cenario();
    await lancar(doctor.id, "2026-08-10", 300);
    await aprovarRepasse(doctor.id, "2026-08");
    const payout = await testPrisma.doctorPayout.findFirstOrThrow();
    await reabrirRepasse(payout.id);

    const entry = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    const r = await updateDailyEntry(entry.id, {
      doctorId: doctor.id,
      date: "2026-08-10",
      amount: 400,
      paid: false,
      lines: [],
    });

    expect(r.error).toBeUndefined();
    const salvo = await testPrisma.doctorDailyEntry.findFirstOrThrow();
    expect(Number(salvo.amount)).toBe(400);
  });
});
