import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.company.findFirst();
  const company =
    existing ?? (await prisma.company.create({ data: { name: "Minha Empresa" } }));

  const accountCount = await prisma.account.count({ where: { companyId: company.id } });
  if (accountCount > 0) {
    console.log("Já existem dados para esta empresa, seed ignorado.");
    return;
  }

  const [contaCorrente, caixa] = await Promise.all([
    prisma.account.create({
      data: { companyId: company.id, name: "Conta Corrente Principal", bank: "Itaú", type: "Conta Corrente", initialBalance: 25000 },
    }),
    prisma.account.create({
      data: { companyId: company.id, name: "Caixa", bank: null, type: "Caixa", initialBalance: 1500 },
    }),
  ]);

  const categoriesData = [
    { name: "Vendas", type: "INCOME" as const, costCenter: "Comercial" },
    { name: "Serviços Prestados", type: "INCOME" as const, costCenter: "Comercial" },
    { name: "Aluguel", type: "EXPENSE" as const, costCenter: "Administrativo" },
    { name: "Folha de Pagamento", type: "EXPENSE" as const, costCenter: "RH" },
    { name: "Fornecedores", type: "EXPENSE" as const, costCenter: "Operacional" },
    { name: "Marketing", type: "EXPENSE" as const, costCenter: "Comercial" },
  ];

  const categories = await Promise.all(
    categoriesData.map((c) => prisma.category.create({ data: { ...c, companyId: company.id } }))
  );

  const byName = (name: string) => categories.find((c) => c.name === name)!;

  const today = new Date();
  const daysAgo = (n: number) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000);
  const daysAhead = (n: number) => new Date(today.getTime() + n * 24 * 60 * 60 * 1000);

  await prisma.transaction.createMany({
    data: [
      { companyId: company.id, accountId: contaCorrente.id, categoryId: byName("Vendas").id, type: "INCOME", amount: 18500, description: "Vendas do mês", date: daysAgo(35), source: "MANUAL" },
      { companyId: company.id, accountId: contaCorrente.id, categoryId: byName("Serviços Prestados").id, type: "INCOME", amount: 6200, description: "Consultoria - Cliente A", date: daysAgo(28), source: "MANUAL" },
      { companyId: company.id, accountId: contaCorrente.id, categoryId: byName("Aluguel").id, type: "EXPENSE", amount: 4500, description: "Aluguel do escritório", date: daysAgo(30), source: "MANUAL" },
      { companyId: company.id, accountId: contaCorrente.id, categoryId: byName("Folha de Pagamento").id, type: "EXPENSE", amount: 12800, description: "Folha de pagamento", date: daysAgo(25), source: "MANUAL" },
      { companyId: company.id, accountId: caixa.id, categoryId: byName("Fornecedores").id, type: "EXPENSE", amount: 2100, description: "Pagamento fornecedor X", date: daysAgo(20), source: "MANUAL" },
      { companyId: company.id, accountId: contaCorrente.id, categoryId: byName("Vendas").id, type: "INCOME", amount: 21300, description: "Vendas do mês", date: daysAgo(5), source: "MANUAL" },
      { companyId: company.id, accountId: contaCorrente.id, categoryId: byName("Marketing").id, type: "EXPENSE", amount: 1800, description: "Campanha de tráfego pago", date: daysAgo(3), source: "MANUAL" },
    ],
  });

  await prisma.scheduledEntry.createMany({
    data: [
      { companyId: company.id, type: "PAYABLE", description: "Aluguel do escritório", amount: 4500, dueDate: daysAhead(5), categoryId: byName("Aluguel").id, status: "PENDING" },
      { companyId: company.id, type: "PAYABLE", description: "Folha de pagamento", amount: 13200, dueDate: daysAhead(12), categoryId: byName("Folha de Pagamento").id, status: "PENDING" },
      { companyId: company.id, type: "RECEIVABLE", description: "Consultoria - Cliente B", amount: 9800, dueDate: daysAhead(8), categoryId: byName("Serviços Prestados").id, status: "PENDING" },
      { companyId: company.id, type: "RECEIVABLE", description: "Venda - Pedido #1032", amount: 5400, dueDate: daysAhead(20), categoryId: byName("Vendas").id, status: "PENDING" },
      { companyId: company.id, type: "PAYABLE", description: "Fornecedor Y - parcela atrasada", amount: 3200, dueDate: daysAgo(4), categoryId: byName("Fornecedores").id, status: "PENDING" },
    ],
  });

  console.log(`Seed concluído para a empresa "${company.name}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
