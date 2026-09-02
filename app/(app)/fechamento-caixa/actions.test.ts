import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createCashClosing, updateCashClosing, deleteCashClosing, type CashClosingInput } from "./actions";

beforeEach(resetDb);

async function seedAccount() {
  const company = await testPrisma.company.create({ data: { name: "Empresa" } });
  const account = await testPrisma.account.create({
    data: { companyId: company.id, name: "Caixa", type: "Caixa", initialBalance: 0 },
  });
  return { company, account };
}

function baseInput(accountId: string, overrides: Partial<CashClosingInput> = {}): CashClosingInput {
  return {
    date: "2026-08-24",
    accountId,
    countedCash: 8062.25,
    sangrias: [
      { label: "CX Anna Carolina", amount: 1097 },
      { label: "CX Amanda", amount: 1740 },
    ],
    pagamentos: [{ label: "Priscila Rejany Balbino de Castro", amount: 1300 }],
    ...overrides,
  };
}

describe("createCashClosing", () => {
  it("cria o fechamento e gera uma unica Transaction com o total de sangrias", async () => {
    const { account } = await seedAccount();

    const result = await createCashClosing(baseInput(account.id));

    expect(result.error).toBeUndefined();

    const closings = await testPrisma.cashClosing.findMany({ include: { lines: true } });
    expect(closings).toHaveLength(1);
    expect(closings[0].lines).toHaveLength(3);
    expect(Number(closings[0].countedCash)).toBe(8062.25);

    const transactions = await testPrisma.transaction.findMany();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ type: "INCOME", accountId: account.id });
    expect(Number(transactions[0].amount)).toBe(2837); // 1097 + 1740

    const category = await testPrisma.category.findFirstOrThrow({ where: { name: "Sangria Caixa" } });
    expect(transactions[0].categoryId).toBe(category.id);
    expect(closings[0].transactionId).toBe(transactions[0].id);
  });

  it("nao cria duas categorias 'Sangria Caixa' em fechamentos diferentes", async () => {
    const { account } = await seedAccount();

    await createCashClosing(baseInput(account.id, { date: "2026-08-21" }));
    await createCashClosing(baseInput(account.id, { date: "2026-08-24" }));

    const categories = await testPrisma.category.findMany({ where: { name: "Sangria Caixa" } });
    expect(categories).toHaveLength(1);
  });

  it("recusa dois fechamentos no mesmo dia para a mesma empresa", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));

    const result = await createCashClosing(baseInput(account.id));

    expect(result.error).toBeTruthy();
    await expect(testPrisma.cashClosing.count()).resolves.toBe(1);
  });

  it("recusa sem nenhuma linha", async () => {
    const { account } = await seedAccount();

    const result = await createCashClosing(baseInput(account.id, { sangrias: [], pagamentos: [] }));

    expect(result.error).toBeTruthy();
    await expect(testPrisma.cashClosing.count()).resolves.toBe(0);
  });

  it("recusa conta de outra empresa", async () => {
    await seedAccount();
    const outraEmpresa = await testPrisma.company.create({ data: { name: "Outra" } });
    const contaDeOutra = await testPrisma.account.create({
      data: { companyId: outraEmpresa.id, name: "Caixa", type: "Caixa", initialBalance: 0 },
    });

    const result = await createCashClosing(baseInput(contaDeOutra.id));

    expect(result.error).toBeTruthy();
  });
});

describe("updateCashClosing", () => {
  it("atualiza o total de sangrias sem duplicar a Transaction vinculada", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    const result = await updateCashClosing(
      closing.id,
      baseInput(account.id, { sangrias: [{ label: "CX Anna Carolina", amount: 5000 }] })
    );

    expect(result.error).toBeUndefined();
    await expect(testPrisma.transaction.count()).resolves.toBe(1);
    const transaction = await testPrisma.transaction.findFirstOrThrow();
    expect(Number(transaction.amount)).toBe(5000);
  });
});

describe("deleteCashClosing", () => {
  it("exclui o fechamento e a Transaction vinculada", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();
    const transactionId = closing.transactionId!;

    const result = await deleteCashClosing(closing.id);

    expect(result.error).toBeUndefined();
    await expect(testPrisma.cashClosing.count()).resolves.toBe(0);
    await expect(testPrisma.transaction.findUnique({ where: { id: transactionId } })).resolves.toBeNull();
  });
});

describe("anexos do fechamento", () => {
  function recibo(nome = "recibo.pdf") {
    return new File([new Uint8Array([7, 7, 7])], nome, { type: "application/pdf" });
  }

  it("grava o fechamento com a nota dos pagamentos", async () => {
    const { company, account } = await seedAccount();

    const r = await createCashClosing(
      baseInput(account.id, {
        pagamentos: [{ label: "Fornecedor X", amount: 50 }],
        anexos: [recibo()],
      })
    );

    expect(r.error).toBeUndefined();
    const fechamento = await testPrisma.cashClosing.findFirstOrThrow({ include: { documents: true } });
    expect(fechamento.documents.map((d) => d.fileName)).toEqual(["recibo.pdf"]);
    // O anexo herda a empresa do fechamento, senão a rota de download o
    // recusaria como "fora do escopo ativo".
    expect(fechamento.documents[0].companyId).toBe(company.id);
  });

  it("salva sem anexo — continua opcional", async () => {
    const { account } = await seedAccount();

    expect((await createCashClosing(baseInput(account.id))).error).toBeUndefined();
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("anexo recusado impede o fechamento inteiro", async () => {
    // Um fechamento que entra sem a nota que a pessoa acha que anexou é
    // pior do que um erro na tela.
    const { account } = await seedAccount();
    const ruim = new File([new Uint8Array([0])], "planilha.xlsx", { type: "application/vnd.ms-excel" });

    const r = await createCashClosing(baseInput(account.id, { anexos: [ruim] }));

    expect(r.error).toMatch(/não é um tipo aceito/);
    await expect(testPrisma.cashClosing.count()).resolves.toBe(0);
    await expect(testPrisma.document.count()).resolves.toBe(0);
  });

  it("editar ACRESCENTA anexo em vez de trocar", async () => {
    // As linhas do dia são recriadas do zero na edição; os anexos não
    // podem seguir a mesma regra, senão corrigir um valor apagaria a nota.
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id, { anexos: [recibo("primeiro.pdf")] }));
    const fechamento = await testPrisma.cashClosing.findFirstOrThrow();

    await updateCashClosing(fechamento.id, baseInput(account.id, { anexos: [recibo("segundo.pdf")] }));

    const documentos = await testPrisma.document.findMany({ orderBy: { fileName: "asc" } });
    expect(documentos.map((d) => d.fileName)).toEqual(["primeiro.pdf", "segundo.pdf"]);
  });

  it("excluir o fechamento leva os anexos junto", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id, { anexos: [recibo()] }));
    const fechamento = await testPrisma.cashClosing.findFirstOrThrow();

    await deleteCashClosing(fechamento.id);

    await expect(testPrisma.document.count()).resolves.toBe(0);
  });
});
