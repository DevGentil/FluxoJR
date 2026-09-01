import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createTransaction, deleteTransaction, deleteTransactions, importTransactions } from "./actions";

beforeEach(resetDb);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function seedAccount() {
  const company = await testPrisma.company.create({ data: { name: "Empresa" } });
  const account = await testPrisma.account.create({
    data: { companyId: company.id, name: "Conta", type: "Caixa", initialBalance: 0 },
  });
  return { company, account };
}

describe("createTransaction", () => {
  it("cria uma transação manual válida", async () => {
    const { account } = await seedAccount();

    const result = await createTransaction(
      undefined,
      formData({
        date: "2026-08-24",
        amount: "150.50",
        type: "EXPENSE",
        description: "Compra de material",
        accountId: account.id,
      })
    );

    expect(result).toBeUndefined();
    const transactions = await testPrisma.transaction.findMany();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ description: "Compra de material", source: "MANUAL" });
  });

  it("rejeita valor zero ou negativo", async () => {
    const { account } = await seedAccount();
    const result = await createTransaction(
      undefined,
      formData({ date: "2026-08-24", amount: "0", type: "EXPENSE", description: "x", accountId: account.id })
    );
    expect(result?.error).toBeTruthy();
  });

  it("rejeita quando nenhuma conta é informada", async () => {
    await seedAccount();
    const result = await createTransaction(
      undefined,
      formData({ date: "2026-08-24", amount: "10", type: "EXPENSE", description: "x", accountId: "" })
    );
    expect(result?.error).toBeTruthy();
  });
});

describe("deleteTransaction", () => {
  it("exclui a transação", async () => {
    const { company, account } = await seedAccount();
    const transaction = await testPrisma.transaction.create({
      data: { companyId: company.id, accountId: account.id, type: "INCOME", amount: 10, description: "x", date: new Date() },
    });

    const result = await deleteTransaction(transaction.id);

    expect(result).toBeUndefined();
    await expect(testPrisma.transaction.findUnique({ where: { id: transaction.id } })).resolves.toBeNull();
  });
});

describe("deleteTransactions", () => {
  it("exclui várias transações de uma vez", async () => {
    const { company, account } = await seedAccount();
    const [t1, t2, t3] = await Promise.all([
      testPrisma.transaction.create({
        data: { companyId: company.id, accountId: account.id, type: "INCOME", amount: 10, description: "a", date: new Date() },
      }),
      testPrisma.transaction.create({
        data: { companyId: company.id, accountId: account.id, type: "INCOME", amount: 20, description: "b", date: new Date() },
      }),
      testPrisma.transaction.create({
        data: { companyId: company.id, accountId: account.id, type: "INCOME", amount: 30, description: "c", date: new Date() },
      }),
    ]);

    const result = await deleteTransactions([t1.id, t2.id]);

    expect(result).toBeUndefined();
    await expect(testPrisma.transaction.findMany()).resolves.toHaveLength(1);
    await expect(testPrisma.transaction.findUnique({ where: { id: t3.id } })).resolves.not.toBeNull();
  });

  it("não exclui transações de outra empresa", async () => {
    // getActiveCompanyId() sem cookie cai na empresa mais antiga — criamos a "própria" primeiro
    // para garantir que a Empresa B não seja escolhida como padrão.
    await testPrisma.company.create({ data: { name: "Minha Empresa" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const contaDeB = await testPrisma.account.create({
      data: { companyId: empresaB.id, name: "Conta de B", type: "Caixa", initialBalance: 0 },
    });
    const transacaoDeB = await testPrisma.transaction.create({
      data: { companyId: empresaB.id, accountId: contaDeB.id, type: "INCOME", amount: 10, description: "x", date: new Date() },
    });

    const result = await deleteTransactions([transacaoDeB.id]);

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.transaction.findUnique({ where: { id: transacaoDeB.id } })).resolves.not.toBeNull();
  });

  it("rejeita uma lista vazia", async () => {
    const result = await deleteTransactions([]);
    expect(result?.error).toBeTruthy();
  });
});

describe("importTransactions", () => {
  it("importa em lote e cria o ImportBatch correspondente", async () => {
    const { account } = await seedAccount();

    const result = await importTransactions({
      fileName: "extrato.csv",
      accountId: account.id,
      rows: [
        { date: "2026-08-01", amount: 100, type: "INCOME", description: "Venda 1" },
        { date: "2026-08-02", amount: 50, type: "EXPENSE", description: "Compra 1" },
      ],
    });

    expect(result.imported).toBe(2);
    const transactions = await testPrisma.transaction.findMany({ orderBy: { date: "asc" } });
    expect(transactions).toHaveLength(2);
    expect(transactions.every((t) => t.source === "IMPORT")).toBe(true);

    const batches = await testPrisma.importBatch.findMany();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ fileName: "extrato.csv", rowsImported: 2 });
  });

  it("rejeita quando a conta não pertence à empresa", async () => {
    await seedAccount();
    await expect(
      importTransactions({
        fileName: "extrato.csv",
        accountId: "conta-inexistente",
        rows: [{ date: "2026-08-01", amount: 100, type: "INCOME", description: "Venda" }],
      })
    ).rejects.toThrow();
  });
});

describe("anexos de nota fiscal e comprovante", () => {
  function nota(nome = "nota.pdf") {
    return new File([new Uint8Array([1, 2, 3, 4])], nome, { type: "application/pdf" });
  }

  function comAnexos(campos: Record<string, string>, arquivos: File[]) {
    const fd = formData(campos);
    for (const a of arquivos) fd.append("anexos", a);
    return fd;
  }

  const base = {
    date: "2026-08-24",
    amount: "150.50",
    type: "EXPENSE",
    description: "Compra de material",
  };

  it("grava a transação com os anexos, na mesma empresa", async () => {
    const { company, account } = await seedAccount();

    const r = await createTransaction(
      undefined,
      comAnexos({ ...base, accountId: account.id }, [nota(), nota("comprovante.pdf")])
    );

    expect(r).toBeUndefined();
    const transacao = await testPrisma.transaction.findFirstOrThrow({ include: { documents: true } });
    expect(transacao.documents.map((d) => d.fileName).sort()).toEqual(["comprovante.pdf", "nota.pdf"]);
    // O anexo herda a empresa do lançamento, senão sumiria do escopo e a
    // rota de download o recusaria como "fora do escopo ativo".
    expect(transacao.documents.every((d) => d.companyId === company.id)).toBe(true);

    // O conteúdo tem que voltar byte a byte — é o arquivo que a pessoa vai
    // baixar. O Prisma devolve `Bytes` como Uint8Array, não Buffer.
    const gravado = transacao.documents.find((d) => d.fileName === "nota.pdf")!;
    expect(new Uint8Array(gravado.content)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(gravado.size).toBe(4);
  });

  it("salva sem anexo nenhum — anexar é opcional", async () => {
    const { account } = await seedAccount();

    const r = await createTransaction(undefined, formData({ ...base, accountId: account.id }));

    expect(r).toBeUndefined();
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("anexo recusado impede a transação inteira", async () => {
    // O ponto do teste não é a mensagem, é o banco: nada pode ter sido
    // gravado. Um lançamento que entra sem a nota que a pessoa acha que
    // anexou é pior do que um erro na tela.
    const { account } = await seedAccount();
    const executavel = new File([new Uint8Array([0])], "virus.exe", { type: "application/x-msdownload" });

    const r = await createTransaction(undefined, comAnexos({ ...base, accountId: account.id }, [executavel]));

    expect(r?.error).toMatch(/não é um tipo aceito/);
    await expect(testPrisma.transaction.count()).resolves.toBe(0);
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("excluir a transação leva os anexos junto", async () => {
    const { account } = await seedAccount();
    await createTransaction(undefined, comAnexos({ ...base, accountId: account.id }, [nota()]));
    const transacao = await testPrisma.transaction.findFirstOrThrow();

    await deleteTransaction(transacao.id);

    // Comprovante órfão não tem leitura possível e ficaria ocupando espaço
    // para sempre sem ninguém saber de onde veio.
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });
});
