import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/tests/helpers/db";
import { createServiceItem, updateServiceItem, deleteServiceItem } from "./service-items-actions";
import { NO_PAYER } from "@/lib/service-catalog";

beforeEach(resetDb);

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const itemBase = {
  name: "Ultrassom de abdome",
  group: "US",
  category: "EXAME",
  payer: "PARTICULAR",
  price: "100",
  operationalCost: "20",
};

describe("createServiceItem", () => {
  it("cria o item com preço, custo de insumo e convênio", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createServiceItem(undefined, form(itemBase));

    expect(result?.error).toBeUndefined();
    const item = await testPrisma.serviceItem.findFirstOrThrow();
    expect(item).toMatchObject({ name: "Ultrassom de abdome", group: "US", category: "EXAME", payer: "PARTICULAR" });
    expect(Number(item.price)).toBe(100);
    expect(Number(item.operationalCost)).toBe(20);
    expect(item.active).toBe(true);
  });

  it("preço em branco vira nulo — plantão e auxílio não têm preço de tabela", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createServiceItem(
      undefined,
      form({ ...itemBase, name: "Plantão por hora", category: "PLANTAO", payer: NO_PAYER, price: "" })
    );

    expect(result?.error).toBeUndefined();
    const item = await testPrisma.serviceItem.findFirstOrThrow();
    expect(item.price).toBeNull();
    expect(item.payer).toBeNull();
  });

  it("custo de insumo em branco vira zero, não nulo", async () => {
    // Diferente do preço: todo item TEM um custo de insumo; zero é a
    // resposta certa para consulta, não "não sei".
    await testPrisma.company.create({ data: { name: "Empresa" } });

    await createServiceItem(undefined, form({ ...itemBase, operationalCost: "" }));

    const item = await testPrisma.serviceItem.findFirstOrThrow();
    expect(Number(item.operationalCost)).toBe(0);
  });

  it("recusa categoria que não existe", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createServiceItem(undefined, form({ ...itemBase, category: "INVENTADA" }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.serviceItem.count()).resolves.toBe(0);
  });

  it("recusa convênio que não existe", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createServiceItem(undefined, form({ ...itemBase, payer: "SUS" }));

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.serviceItem.count()).resolves.toBe(0);
  });

  it("recusa nome vazio", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });

    const result = await createServiceItem(undefined, form({ ...itemBase, name: "" }));

    expect(result?.error).toBeTruthy();
  });
});

describe("updateServiceItem", () => {
  it("altera o preço", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    await createServiceItem(undefined, form(itemBase));
    const item = await testPrisma.serviceItem.findFirstOrThrow();

    const result = await updateServiceItem(item.id, undefined, form({ ...itemBase, price: "130" }));

    expect(result?.error).toBeUndefined();
    expect(Number((await testPrisma.serviceItem.findFirstOrThrow()).price)).toBe(130);
  });

  it("desmarcar 'ativo' arquiva sem apagar", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    await createServiceItem(undefined, form(itemBase));
    const item = await testPrisma.serviceItem.findFirstOrThrow();

    await updateServiceItem(item.id, undefined, form({ ...itemBase, active: "false" }));

    const atualizado = await testPrisma.serviceItem.findFirstOrThrow();
    expect(atualizado.active).toBe(false);
    await expect(testPrisma.serviceItem.count()).resolves.toBe(1);
  });

  it("não alcança item de outra empresa", async () => {
    await testPrisma.company.create({ data: { name: "Empresa A" } });
    const empresaB = await testPrisma.company.create({ data: { name: "Empresa B" } });
    const itemB = await testPrisma.serviceItem.create({
      data: { companyId: empresaB.id, name: "Item de B", category: "EXAME" },
    });

    const result = await updateServiceItem(itemB.id, undefined, form({ ...itemBase, name: "Invadido" }));

    expect(result?.error).toBeTruthy();
    expect((await testPrisma.serviceItem.findUniqueOrThrow({ where: { id: itemB.id } })).name).toBe("Item de B");
  });
});

describe("deleteServiceItem", () => {
  it("exclui item que nunca foi usado", async () => {
    await testPrisma.company.create({ data: { name: "Empresa" } });
    await createServiceItem(undefined, form(itemBase));
    const item = await testPrisma.serviceItem.findFirstOrThrow();

    const result = await deleteServiceItem(item.id);

    expect(result?.error).toBeUndefined();
    await expect(testPrisma.serviceItem.count()).resolves.toBe(0);
  });

  it("recusa excluir item que está no contrato de um médico", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    await createServiceItem(undefined, form(itemBase));
    const item = await testPrisma.serviceItem.findFirstOrThrow();
    await testPrisma.doctor.create({
      data: {
        companyId: company.id,
        name: "Dr. Contratado",
        serviceRates: {
          create: [{ serviceItemId: item.id, rate: 45, validFrom: new Date("2026-01-01T00:00:00Z") }],
        },
      },
    });

    const result = await deleteServiceItem(item.id);

    expect(result?.error).toBeTruthy();
    await expect(testPrisma.serviceItem.count()).resolves.toBe(1);
  });

  it("diz de quem é o contrato que seria apagado", async () => {
    const company = await testPrisma.company.create({ data: { name: "Empresa" } });
    await createServiceItem(undefined, form(itemBase));
    const item = await testPrisma.serviceItem.findFirstOrThrow();
    for (const nome of ["Dra. Adriana", "Dr. Altino"]) {
      await testPrisma.doctor.create({
        data: {
          companyId: company.id,
          name: nome,
          serviceRates: {
            create: [{ serviceItemId: item.id, rate: 45, validFrom: new Date("2026-01-01T00:00:00Z") }],
          },
        },
      });
    }

    const result = await deleteServiceItem(item.id);

    expect(result?.error).toContain("Dra. Adriana");
    expect(result?.error).toContain("Dr. Altino");
  });
});
