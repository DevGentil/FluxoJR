import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createScheduledEntry, markAsPaid, importScheduledEntries } from "./actions";

beforeEach(resetDb);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function seedAccount(initialBalance = 0) {
  const company = await testPrisma.company.create({ data: { name: "Empresa" } });
  const account = await testPrisma.account.create({
    data: { companyId: company.id, name: "Conta", type: "Caixa", initialBalance },
  });
  return { company, account };
}

/** A baixa passou a receber FormData para o comprovante poder vir junto.
 * Este helper monta o formulario minimo, sem anexo — que e o caso da
 * maioria dos testes. */
function baixa(entryId: string, accountId: string, anexos: File[] = []) {
  const fd = new FormData();
  fd.set("accountId", accountId);
  for (const a of anexos) fd.append("anexos", a);
  return markAsPaid(entryId, undefined, fd);
}

describe("createScheduledEntry", () => {
  it("cria um lançamento a pagar sem conta definida (definida só na baixa)", async () => {
    await seedAccount();

    const result = await createScheduledEntry(
      undefined,
      formData({
        type: "PAYABLE",
        description: "Aluguel",
        amount: "1500",
        dueDate: "2026-09-05",
        accountId: "__none__",
        categoryId: "__none__",
      })
    );

    expect(result).toBeUndefined();
    const entries = await testPrisma.scheduledEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "PAYABLE", status: "PENDING", accountId: null });
  });
});

describe("importScheduledEntries", () => {
  it("importa em lote sem conta definida (fica para a baixa)", async () => {
    await seedAccount();

    const result = await importScheduledEntries({
      fileName: "planilha.csv",
      rows: [
        { dueDate: "2026-09-10", amount: 680, type: "PAYABLE", description: "Manutenção equipamento" },
        { dueDate: "2026-09-20", amount: 1250.5, type: "RECEIVABLE", description: "Reembolso convênio" },
      ],
    });

    expect(result.imported).toBe(2);
    const entries = await testPrisma.scheduledEntry.findMany({ orderBy: { dueDate: "asc" } });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.status === "PENDING" && e.accountId === null)).toBe(true);
    expect(entries[0]).toMatchObject({ type: "PAYABLE", description: "Manutenção equipamento" });
    expect(entries[1]).toMatchObject({ type: "RECEIVABLE", description: "Reembolso convênio" });
  });

  it("aceita uma conta de destino válida da mesma empresa", async () => {
    const { account } = await seedAccount();

    await importScheduledEntries({
      fileName: "planilha.csv",
      accountId: account.id,
      rows: [{ dueDate: "2026-09-10", amount: 100, type: "PAYABLE", description: "Conta" }],
    });

    const entry = await testPrisma.scheduledEntry.findFirstOrThrow();
    expect(entry.accountId).toBe(account.id);
  });

  it("rejeita quando a conta não pertence à empresa", async () => {
    await seedAccount();
    await expect(
      importScheduledEntries({
        fileName: "planilha.csv",
        accountId: "conta-inexistente",
        rows: [{ dueDate: "2026-09-10", amount: 100, type: "PAYABLE", description: "Conta" }],
      })
    ).rejects.toThrow();
  });
});

describe("markAsPaid", () => {
  it("cria a transação vinculada e atualiza o status para PAID", async () => {
    const { company, account } = await seedAccount(1000);
    const entry = await testPrisma.scheduledEntry.create({
      data: { companyId: company.id, type: "PAYABLE", description: "Aluguel", amount: 300, dueDate: new Date(), status: "PENDING" },
    });

    const result = await baixa(entry.id, account.id);

    expect(result).toBeUndefined();

    const updatedEntry = await testPrisma.scheduledEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updatedEntry.status).toBe("PAID");
    expect(updatedEntry.accountId).toBe(account.id);
    expect(updatedEntry.transactionId).not.toBeNull();
    expect(updatedEntry.paidDate).not.toBeNull();

    const transaction = await testPrisma.transaction.findUniqueOrThrow({
      where: { id: updatedEntry.transactionId! },
    });
    expect(transaction).toMatchObject({
      type: "EXPENSE",
      description: "Aluguel",
      accountId: account.id,
      source: "SCHEDULED",
    });
    expect(Number(transaction.amount)).toBe(300);
  });

  it("cria uma transação de tipo INCOME para contas a receber", async () => {
    const { company, account } = await seedAccount();
    const entry = await testPrisma.scheduledEntry.create({
      data: { companyId: company.id, type: "RECEIVABLE", description: "Consultoria", amount: 800, dueDate: new Date(), status: "PENDING" },
    });

    await baixa(entry.id, account.id);

    const transaction = await testPrisma.transaction.findFirstOrThrow({ where: { description: "Consultoria" } });
    expect(transaction.type).toBe("INCOME");
  });

  it("recusa baixar um lançamento já pago", async () => {
    const { company, account } = await seedAccount();
    const entry = await testPrisma.scheduledEntry.create({
      data: {
        companyId: company.id,
        type: "PAYABLE",
        description: "Já pago",
        amount: 100,
        dueDate: new Date(),
        status: "PAID",
        paidDate: new Date(),
      },
    });

    const result = await baixa(entry.id, account.id);
    expect(result?.error).toBeTruthy();
  });

  it("recusa baixar usando uma conta de outra empresa", async () => {
    const { company } = await seedAccount();
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const contaDeB = await testPrisma.account.create({
      data: { companyId: empresaB.id, name: "Conta de B", type: "Caixa", initialBalance: 0 },
    });
    const entry = await testPrisma.scheduledEntry.create({
      data: { companyId: company.id, type: "PAYABLE", description: "Aluguel", amount: 100, dueDate: new Date(), status: "PENDING" },
    });

    const result = await baixa(entry.id, contaDeB.id);
    expect(result?.error).toBeTruthy();
    await expect(testPrisma.scheduledEntry.findUniqueOrThrow({ where: { id: entry.id } })).resolves.toMatchObject({
      status: "PENDING",
    });
  });
});

describe("anexos de nota e comprovante", () => {
  function pdf(nome: string) {
    return new File([new Uint8Array([9, 9])], nome, { type: "application/pdf" });
  }

  it("a conta a pagar nasce com a nota anexada", async () => {
    const { company, account } = await seedAccount();
    const fd = new FormData();
    fd.set("type", "PAYABLE");
    fd.set("description", "Aluguel");
    fd.set("amount", "300");
    fd.set("dueDate", "2026-09-10");
    fd.set("accountId", account.id);
    fd.append("anexos", pdf("nota-aluguel.pdf"));

    const r = await createScheduledEntry(undefined, fd);

    expect(r).toBeUndefined();
    const entry = await testPrisma.scheduledEntry.findFirstOrThrow({ include: { documents: true } });
    expect(entry.documents.map((d) => d.fileName)).toEqual(["nota-aluguel.pdf"]);
    expect(entry.documents[0].companyId).toBe(company.id);
  });

  it("a baixa guarda o comprovante no lançamento", async () => {
    // É o caminho que a feature existe para servir: quem acabou de pagar
    // tem o PDF do banco na mão, e o comprovante fica onde a conta está.
    const { account } = await seedAccount(1000);
    const entry = await testPrisma.scheduledEntry.create({
      data: { companyId: account.companyId, type: "PAYABLE", description: "Energia", amount: 200, dueDate: new Date(), status: "PENDING" },
    });

    const r = await baixa(entry.id, account.id, [pdf("comprovante-energia.pdf")]);

    expect(r).toBeUndefined();
    const salvo = await testPrisma.scheduledEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { documents: true },
    });
    expect(salvo.status).toBe("PAID");
    expect(salvo.documents.map((d) => d.fileName)).toEqual(["comprovante-energia.pdf"]);
  });

  it("a baixa acontece sem comprovante — anexar não pode travar o pagamento", async () => {
    const { account } = await seedAccount(1000);
    const entry = await testPrisma.scheduledEntry.create({
      data: { companyId: account.companyId, type: "PAYABLE", description: "Água", amount: 50, dueDate: new Date(), status: "PENDING" },
    });

    expect(await baixa(entry.id, account.id)).toBeUndefined();
    await expect(
      testPrisma.scheduledEntry.findUniqueOrThrow({ where: { id: entry.id } })
    ).resolves.toMatchObject({ status: "PAID" });
  });

  it("comprovante recusado não deixa a baixa acontecer pela metade", async () => {
    const { account } = await seedAccount(1000);
    const entry = await testPrisma.scheduledEntry.create({
      data: { companyId: account.companyId, type: "PAYABLE", description: "Internet", amount: 90, dueDate: new Date(), status: "PENDING" },
    });
    const ruim = new File([new Uint8Array([0])], "foto.bmp", { type: "image/bmp" });

    const r = await baixa(entry.id, account.id, [ruim]);

    expect(r?.error).toBeTruthy();
    await expect(
      testPrisma.scheduledEntry.findUniqueOrThrow({ where: { id: entry.id } })
    ).resolves.toMatchObject({ status: "PENDING" });
    // Nenhuma transação criada: a baixa toda foi desfeita.
    await expect(testPrisma.transaction.count()).resolves.toBe(0);
  });
});
