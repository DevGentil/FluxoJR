import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createAccount, deleteAccount, updateAccount } from "./actions";

beforeEach(resetDb);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createAccount", () => {
  it("cria a conta vinculada à empresa padrão", async () => {
    const result = await createAccount(
      undefined,
      formData({ name: "Conta Corrente", bank: "Itaú", type: "Conta Corrente", initialBalance: "1000" })
    );

    expect(result).toBeUndefined();
    const accounts = await testPrisma.account.findMany();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ name: "Conta Corrente", bank: "Itaú" });
    expect(Number(accounts[0].initialBalance)).toBe(1000);
  });

  it("rejeita quando o nome está vazio", async () => {
    const result = await createAccount(
      undefined,
      formData({ name: "", type: "Conta Corrente", initialBalance: "0" })
    );

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.account.findMany()).resolves.toHaveLength(0);
  });
});

describe("updateAccount", () => {
  it("atualiza os dados da conta", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const account = await testPrisma.account.create({
      data: { companyId: company.id, name: "Antigo Nome", type: "Caixa", initialBalance: 0 },
    });

    const result = await updateAccount(
      account.id,
      undefined,
      formData({ name: "Novo Nome", type: "Caixa", initialBalance: "0" })
    );

    expect(result).toBeUndefined();
    const updated = await testPrisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(updated.name).toBe("Novo Nome");
  });

  it("não afeta contas de outra empresa (escopo por companyId)", async () => {
    await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const contaDeB = await testPrisma.account.create({
      data: { companyId: empresaB.id, name: "Conta de B", type: "Caixa", initialBalance: 0 },
    });

    // getActiveCompanyId() pega a empresa mais antiga — nesse cenário é a Empresa A.
    const result = await updateAccount(
      contaDeB.id,
      undefined,
      formData({ name: "Tentativa de invasão", type: "Caixa", initialBalance: "0" })
    );

    expect(result?.error).toBeTruthy();
    const unchanged = await testPrisma.account.findUniqueOrThrow({ where: { id: contaDeB.id } });
    expect(unchanged.name).toBe("Conta de B");
  });
});

describe("deleteAccount", () => {
  it("exclui a conta", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    const account = await testPrisma.account.create({
      data: { companyId: company.id, name: "Conta", type: "Caixa", initialBalance: 0 },
    });

    const result = await deleteAccount(account.id);

    expect(result).toBeUndefined();
    await expect(testPrisma.account.findUnique({ where: { id: account.id } })).resolves.toBeNull();
  });

  it("retorna erro ao tentar excluir um id inexistente", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    const result = await deleteAccount("id-inexistente");
    expect(result?.error).toBeTruthy();
  });
});
