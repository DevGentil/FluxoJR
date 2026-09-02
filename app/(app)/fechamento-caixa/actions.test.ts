import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import {
  aprovarFechamento,
  createCashClosing,
  deleteCashClosing,
  reabrirFechamento,
  updateCashClosing,
  type CashClosingInput,
} from "./actions";

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
  it("nasce PENDENTE e nao lanca nada no razao", async () => {
    const { account } = await seedAccount();

    const result = await createCashClosing(baseInput(account.id));

    expect(result.error).toBeUndefined();

    const closings = await testPrisma.cashClosing.findMany({ include: { lines: true } });
    expect(closings).toHaveLength(1);
    expect(closings[0].lines).toHaveLength(3);
    expect(Number(closings[0].countedCash)).toBe(8062.25);

    // O dia foi conferido, mas quem decide que ele entra no resultado e o
    // financeiro. Ate la nao existe lancamento nenhum.
    expect(closings[0].status).toBe("PENDENTE");
    await expect(testPrisma.transaction.count()).resolves.toBe(0);
  });

  it("nao cria duas categorias 'Sangria Caixa' em fechamentos diferentes", async () => {
    const { account } = await seedAccount();

    await createCashClosing(baseInput(account.id, { date: "2026-08-21" }));
    await createCashClosing(baseInput(account.id, { date: "2026-08-24" }));
    for (const c of await testPrisma.cashClosing.findMany()) await aprovarFechamento(c.id);

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
  it("altera as linhas enquanto esta pendente", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    const result = await updateCashClosing(
      closing.id,
      baseInput(account.id, { sangrias: [{ label: "CX Anna Carolina", amount: 5000 }] })
    );

    expect(result.error).toBeUndefined();
    const linhas = await testPrisma.cashClosingLine.findMany({ where: { type: "SANGRIA" } });
    expect(linhas.map((l) => Number(l.amount))).toEqual([5000]);
  });

  it("recusa editar depois de aprovado", async () => {
    // Aprovado e numero que ja entrou no resultado. Editar por baixo
    // deixaria a receita do Balanco diferente da soma das linhas na tela.
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();
    await aprovarFechamento(closing.id);

    const r = await updateCashClosing(closing.id, baseInput(account.id));
    expect(r.error).toMatch(/Reabra antes de editar/);
  });
});

describe("deleteCashClosing", () => {
  it("exclui o fechamento pendente", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    const result = await deleteCashClosing(closing.id);

    expect(result.error).toBeUndefined();
    await expect(testPrisma.cashClosing.count()).resolves.toBe(0);
  });

  it("recusa excluir o que ja foi aprovado", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();
    await aprovarFechamento(closing.id);

    const r = await deleteCashClosing(closing.id);
    expect(r.error).toMatch(/Reabra antes de excluir/);
    await expect(testPrisma.cashClosing.count()).resolves.toBe(1);
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

describe("o valor que chega em Transações", () => {
  it("posta os valores BRUTOS, sem compensar um com o outro", async () => {
    // Sob a regra antiga isto virava um lançamento só, de 100 − 400 = −300.
    // Agora o dia aparece como foi: entrou 100, saiu 400.
    const { account } = await seedAccount();
    await createCashClosing(
      baseInput(account.id, {
        sangrias: [{ label: "CX 1", amount: 100 }],
        pagamentos: [{ label: "Fornecedor", amount: 400 }],
      })
    );
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    await aprovarFechamento(closing.id);

    const t = await testPrisma.transaction.findMany({ orderBy: { type: "asc" } });
    // A ordem segue a declaracao do enum (INCOME antes de EXPENSE).
    expect(t.map((x) => [x.type, Number(x.amount)])).toEqual([
      ["INCOME", 100],
      ["EXPENSE", 400],
    ]);
  });

  it("a transação aponta de volta para o fechamento que a gerou", async () => {
    // É o que faz o botão "ver detalhes" existir em Transações: sem o
    // vínculo, a linha do caixa seria um número sem origem.
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    await aprovarFechamento(closing.id);

    const t = await testPrisma.transaction.findMany();
    expect(t.every((x) => x.cashClosingId === closing.id)).toBe(true);
  });
});

describe("aprovação do financeiro", () => {
  it("gera DUAS transações: sangria como receita, pagamento como despesa", async () => {
    // O ponto da mudança. O líquido daria o mesmo saldo e mentiria no
    // resultado: R$ 2.837 de sangria com R$ 1.300 de pagamento viraria
    // R$ 1.537 de receita e nenhuma despesa, e a margem sairia melhor do
    // que foi.
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    const r = await aprovarFechamento(closing.id);

    expect(r.error).toBeUndefined();
    const transacoes = await testPrisma.transaction.findMany({ orderBy: { type: "asc" } });
    expect(transacoes).toHaveLength(2);

    const receita = transacoes.find((t) => t.type === "INCOME")!;
    const despesa = transacoes.find((t) => t.type === "EXPENSE")!;
    expect(Number(receita.amount)).toBe(2837); // 1097 + 1740
    expect(Number(despesa.amount)).toBe(1300);
    expect(receita.cashClosingId).toBe(closing.id);
    expect(despesa.cashClosingId).toBe(closing.id);
  });

  it("cada uma na sua categoria, e do tipo certo", async () => {
    // Receita e despesa na mesma categoria fariam o relatório mostrar um
    // número que não é nem uma coisa nem outra.
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    await aprovarFechamento(closing.id);

    const categorias = await testPrisma.category.findMany({ orderBy: { name: "asc" } });
    expect(categorias.map((c) => `${c.name}/${c.type}`)).toEqual([
      "Pagamentos em Dinheiro/EXPENSE",
      "Sangria Caixa/INCOME",
    ]);
  });

  it("dia sem pagamento gera só a receita", async () => {
    // Lançamento de zero polui a lista e não muda nada.
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id, { pagamentos: [] }));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    await aprovarFechamento(closing.id);

    const transacoes = await testPrisma.transaction.findMany();
    expect(transacoes).toHaveLength(1);
    expect(transacoes[0].type).toBe("INCOME");
  });

  it("marca quem aprovou e quando", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    await aprovarFechamento(closing.id);

    const salvo = await testPrisma.cashClosing.findUniqueOrThrow({ where: { id: closing.id } });
    expect(salvo.status).toBe("APROVADO");
    expect(salvo.approvedAt).not.toBeNull();
  });

  it("aprovar duas vezes não duplica o lançamento", async () => {
    // Dois cliques no botão, ou dois aprovadores ao mesmo tempo, dobrariam
    // a receita do dia.
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    await aprovarFechamento(closing.id);
    const segunda = await aprovarFechamento(closing.id);

    expect(segunda.error).toMatch(/já foi aprovado/);
    await expect(testPrisma.transaction.count()).resolves.toBe(2);
  });
});

describe("reabrir o fechamento", () => {
  it("tira os lançamentos do resultado e volta a PENDENTE", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();
    await aprovarFechamento(closing.id);

    const r = await reabrirFechamento(closing.id);

    expect(r.error).toBeUndefined();
    await expect(testPrisma.transaction.count()).resolves.toBe(0);
    const salvo = await testPrisma.cashClosing.findUniqueOrThrow({ where: { id: closing.id } });
    expect(salvo.status).toBe("PENDENTE");
    expect(salvo.approvedAt).toBeNull();
  });

  it("reabrir preserva as linhas e os anexos do dia", async () => {
    // É o motivo de reabrir existir em vez de mandar excluir e refazer.
    const { account } = await seedAccount();
    const pdf = new File([new Uint8Array([1, 2])], "recibo.pdf", { type: "application/pdf" });
    await createCashClosing(baseInput(account.id, { anexos: [pdf] }));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();
    await aprovarFechamento(closing.id);

    await reabrirFechamento(closing.id);

    await expect(testPrisma.cashClosingLine.count()).resolves.toBe(3);
    await expect(testPrisma.document.count()).resolves.toBe(1);
  });

  it("recusa reabrir o que ainda nem foi aprovado", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();

    const r = await reabrirFechamento(closing.id);
    expect(r.error).toMatch(/ainda não foi aprovado/);
  });

  it("aprovar de novo depois de corrigir usa os valores novos", async () => {
    const { account } = await seedAccount();
    await createCashClosing(baseInput(account.id));
    const closing = await testPrisma.cashClosing.findFirstOrThrow();
    await aprovarFechamento(closing.id);
    await reabrirFechamento(closing.id);

    await updateCashClosing(closing.id, baseInput(account.id, { sangrias: [{ label: "CX 1", amount: 100 }] }));
    await aprovarFechamento(closing.id);

    const receita = await testPrisma.transaction.findFirstOrThrow({ where: { type: "INCOME" } });
    expect(Number(receita.amount)).toBe(100);
  });
});
