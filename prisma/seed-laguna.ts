/** Popula a AS Laguna com dados fictícios completos, para demonstração.
 *
 * SÓ a AS Laguna. A AS Contagem carrega a operação real (84 médicos,
 * 2.490 lançamentos) e não é tocada por este arquivo em nenhuma hipótese —
 * a checagem do nome existe justamente para isso.
 *
 * Tudo é aditivo: nada é apagado. Para limpar depois, basta remover o que
 * pertence a esta empresa.
 *
 * Roda com: npx tsx prisma/seed-laguna.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 });
const prisma = new PrismaClient({ adapter });

const EMPRESA = "AS Laguna";

/** Meia-noite UTC — a convenção de data do sistema inteiro. */
function dia(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function ultimoDia(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes, 0, 23, 59, 59));
}

/** Espalha valores com uma variação previsível, para os gráficos terem
 * forma sem parecerem aleatórios demais. */
function variar(base: number, indice: number, amplitude = 0.18) {
  const onda = Math.sin(indice * 1.7) * amplitude;
  return Math.round(base * (1 + onda) * 100) / 100;
}

const MESES = [
  { ano: 2026, mes: 3 },
  { ano: 2026, mes: 4 },
  { ano: 2026, mes: 5 },
  { ano: 2026, mes: 6 },
  { ano: 2026, mes: 7 },
  { ano: 2026, mes: 8 },
];

async function main() {
  const empresa = await prisma.company.findFirst({ where: { name: EMPRESA } });
  if (!empresa) throw new Error(`Empresa "${EMPRESA}" não encontrada.`);
  const companyId = empresa.id;
  console.log(`Populando ${EMPRESA} (${companyId})`);

  const contas = await prisma.account.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  const contaCorrente = contas.find((c) => /corrente|principal/i.test(c.name)) ?? contas[0];
  const caixa = contas.find((c) => /caixa/i.test(c.name)) ?? contas[contas.length - 1];

  // ---------- Categorias ----------
  const catDefs: { name: string; type: "INCOME" | "EXPENSE"; costCenter: string | null }[] = [
    { name: "Consultas Particulares", type: "INCOME", costCenter: "Atendimento" },
    { name: "Convênios", type: "INCOME", costCenter: "Atendimento" },
    { name: "Exames de Imagem", type: "INCOME", costCenter: "Diagnóstico" },
    { name: "Procedimentos", type: "INCOME", costCenter: "Atendimento" },
    { name: "Energia e Água", type: "EXPENSE", costCenter: "Estrutura" },
    { name: "Internet e Telefonia", type: "EXPENSE", costCenter: "Estrutura" },
    { name: "Limpeza e Conservação", type: "EXPENSE", costCenter: "Estrutura" },
    { name: "Material de Escritório", type: "EXPENSE", costCenter: "Administrativo" },
    { name: "Manutenção de Equipamentos", type: "EXPENSE", costCenter: "Diagnóstico" },
    { name: "Software e Sistemas", type: "EXPENSE", costCenter: "Administrativo" },
  ];
  const categorias = new Map<string, string>();
  for (const c of catDefs) {
    const existente = await prisma.category.findFirst({ where: { companyId, name: c.name } });
    const salva = existente ?? (await prisma.category.create({ data: { ...c, companyId } }));
    categorias.set(c.name, salva.id);
  }
  for (const c of await prisma.category.findMany({ where: { companyId } })) {
    categorias.set(c.name, c.id);
  }
  console.log(`  categorias: ${categorias.size}`);

  // ---------- Fornecedores ----------
  const fornDefs = [
    { name: "CELESC Distribuição", document: "08.336.783/0001-90", phone: "(48) 3221-7000", email: "atendimento@celesc.com.br" },
    { name: "Unimed Grande Florianópolis", document: "83.646.togus/0001-00".replace("togus", "128"), phone: "(48) 3251-0100", email: "faturamento@unimed.coop.br" },
    { name: "Vivo Empresas", document: "02.449.992/0001-64", phone: "10315", email: "corporativo@vivo.com.br" },
    { name: "Cirúrgica Santa Catarina", document: "05.442.187/0001-33", phone: "(48) 3244-8800", email: "vendas@cirurgicasc.com.br" },
    { name: "ConservaSul Limpeza", document: "19.887.442/0001-05", phone: "(48) 3035-1120", email: "contato@conservasul.com.br" },
    { name: "TecnoMed Manutenção", document: "31.556.900/0001-77", phone: "(48) 3028-4411", email: "suporte@tecnomed.com.br" },
  ];
  const fornecedores = new Map<string, string>();
  for (const f of fornDefs) {
    const existente = await prisma.supplier.findFirst({ where: { companyId, name: f.name } });
    const salvo = existente ?? (await prisma.supplier.create({ data: { ...f, companyId } }));
    fornecedores.set(f.name, salvo.id);
  }
  console.log(`  fornecedores: ${fornecedores.size}`);

  // ---------- Transações dos últimos meses ----------
  // Receita e despesa recorrentes, para o Balanço e os gráficos terem
  // história em vez de um mês solto.
  const receitas = [
    { cat: "Convênios", desc: "Repasse de convênios do mês", base: 38500 },
    { cat: "Consultas Particulares", desc: "Consultas particulares — recebimento", base: 21400 },
    { cat: "Exames de Imagem", desc: "Exames de imagem — faturamento", base: 16800 },
    { cat: "Procedimentos", desc: "Procedimentos ambulatoriais", base: 9200 },
  ];
  const despesas = [
    { cat: "Energia e Água", desc: "CELESC — energia elétrica", base: 3180, forn: "CELESC Distribuição" },
    { cat: "Internet e Telefonia", desc: "Vivo — link dedicado e telefonia", base: 1240, forn: "Vivo Empresas" },
    { cat: "Limpeza e Conservação", desc: "ConservaSul — equipe de limpeza", base: 4600, forn: "ConservaSul Limpeza" },
    { cat: "Material de Escritório", desc: "Cirúrgica SC — insumos e descartáveis", base: 5850, forn: "Cirúrgica Santa Catarina" },
    { cat: "Manutenção de Equipamentos", desc: "TecnoMed — manutenção preventiva", base: 2300, forn: "TecnoMed Manutenção" },
    { cat: "Software e Sistemas", desc: "Licenças de software da unidade", base: 890, forn: null },
  ];

  let criadas = 0;
  for (const [i, { ano, mes }] of MESES.entries()) {
    for (const [j, r] of receitas.entries()) {
      await prisma.transaction.create({
        data: {
          date: dia(`${ano}-${String(mes).padStart(2, "0")}-${String(5 + j * 6).padStart(2, "0")}`),
          amount: variar(r.base, i + j),
          type: "INCOME",
          description: r.desc,
          companyId,
          accountId: contaCorrente.id,
          categoryId: categorias.get(r.cat) ?? null,
          source: "MANUAL",
        },
      });
      criadas++;
    }
    for (const [j, d] of despesas.entries()) {
      await prisma.transaction.create({
        data: {
          date: dia(`${ano}-${String(mes).padStart(2, "0")}-${String(8 + j * 3).padStart(2, "0")}`),
          amount: variar(d.base, i + j + 3, 0.1),
          type: "EXPENSE",
          description: d.desc,
          companyId,
          accountId: contaCorrente.id,
          categoryId: categorias.get(d.cat) ?? null,
          supplierId: d.forn ? (fornecedores.get(d.forn) ?? null) : null,
          source: "MANUAL",
        },
      });
      criadas++;
    }
  }
  console.log(`  transações: ${criadas}`);

  // ---------- Contas a pagar e a receber ----------
  const hoje = new Date();
  const emDias = (n: number) => {
    const d = new Date(hoje);
    d.setUTCDate(d.getUTCDate() + n);
    return dia(d.toISOString().slice(0, 10));
  };

  const agendados: {
    type: "PAYABLE" | "RECEIVABLE";
    description: string;
    amount: number;
    dueDate: Date;
    cat: string;
    forn: string | null;
    status: "PENDING" | "PAID";
  }[] = [
    { type: "PAYABLE", description: "CELESC — energia de setembro", amount: 3240.7, dueDate: emDias(6), cat: "Energia e Água", forn: "CELESC Distribuição", status: "PENDING" },
    { type: "PAYABLE", description: "ConservaSul — limpeza de setembro", amount: 4600, dueDate: emDias(12), cat: "Limpeza e Conservação", forn: "ConservaSul Limpeza", status: "PENDING" },
    { type: "PAYABLE", description: "TecnoMed — contrato de manutenção", amount: 2300, dueDate: emDias(-4), cat: "Manutenção de Equipamentos", forn: "TecnoMed Manutenção", status: "PENDING" },
    { type: "PAYABLE", description: "Cirúrgica SC — pedido de insumos", amount: 6120.4, dueDate: emDias(-11), cat: "Material de Escritório", forn: "Cirúrgica Santa Catarina", status: "PENDING" },
    { type: "PAYABLE", description: "Vivo — link dedicado", amount: 1240, dueDate: emDias(19), cat: "Internet e Telefonia", forn: "Vivo Empresas", status: "PENDING" },
    { type: "RECEIVABLE", description: "Unimed — produção de agosto", amount: 28400, dueDate: emDias(9), cat: "Convênios", forn: "Unimed Grande Florianópolis", status: "PENDING" },
    { type: "RECEIVABLE", description: "Unimed — produção de julho", amount: 26150, dueDate: emDias(-21), cat: "Convênios", forn: "Unimed Grande Florianópolis", status: "PENDING" },
    { type: "RECEIVABLE", description: "Convênio empresarial — mensalidade", amount: 7300, dueDate: emDias(15), cat: "Convênios", forn: null, status: "PENDING" },
  ];

  for (const a of agendados) {
    await prisma.scheduledEntry.create({
      data: {
        type: a.type,
        description: a.description,
        amount: a.amount,
        dueDate: a.dueDate,
        status: a.status,
        companyId,
        accountId: contaCorrente.id,
        categoryId: categorias.get(a.cat) ?? null,
        supplierId: a.forn ? (fornecedores.get(a.forn) ?? null) : null,
      },
    });
  }
  console.log(`  contas a pagar/receber: ${agendados.length}`);

  // ---------- Fechamentos de caixa ----------
  // Alguns aprovados (com as duas transações) e os mais recentes pendentes,
  // para a tela mostrar os dois estados.
  const atendentes = ["CX Recepção 1", "CX Recepção 2", "CX Enfermagem"];
  const saidas = ["Lanche da equipe", "Táxi para exame externo", "Material de reposição", "Freelancer da recepção"];

  const catSangria =
    (await prisma.category.findFirst({ where: { companyId, name: "Sangria Caixa", type: "INCOME" } })) ??
    (await prisma.category.create({ data: { companyId, name: "Sangria Caixa", type: "INCOME" } }));
  const catPagamento =
    (await prisma.category.findFirst({ where: { companyId, name: "Pagamentos em Dinheiro", type: "EXPENSE" } })) ??
    (await prisma.category.create({ data: { companyId, name: "Pagamentos em Dinheiro", type: "EXPENSE" } }));

  let fechamentos = 0;
  for (let k = 0; k < 8; k++) {
    const data = emDias(-(k * 3 + 1));
    if (await prisma.cashClosing.findFirst({ where: { companyId, date: data } })) continue;

    const linhasSangria = atendentes.slice(0, 2 + (k % 2)).map((label, i) => ({
      type: "SANGRIA" as const,
      label,
      amount: variar(1150 + i * 320, k + i),
      order: i,
    }));
    const linhasPagamento = saidas.slice(0, 1 + (k % 3)).map((label, i) => ({
      type: "PAGAMENTO" as const,
      label,
      amount: variar(120 + i * 90, k + i, 0.25),
      order: i,
    }));

    const totalS = linhasSangria.reduce((s, l) => s + l.amount, 0);
    const totalP = linhasPagamento.reduce((s, l) => s + l.amount, 0);
    // Um dia com diferença pequena, para a conferência não parecer sempre
    // perfeita — que é o que acontece na vida real.
    const diferenca = k === 3 ? -12.5 : k === 6 ? 8 : 0;

    const aprovado = k >= 2;
    const fechamento = await prisma.cashClosing.create({
      data: {
        date: data,
        companyId,
        accountId: caixa.id,
        countedCash: Math.round((totalS - totalP + diferenca) * 100) / 100,
        notes: diferenca !== 0 ? "Diferença conferida com a recepção." : null,
        status: aprovado ? "APROVADO" : "PENDENTE",
        approvedAt: aprovado ? data : null,
        approvedByName: aprovado ? "Davi Gentil" : null,
        lines: { create: [...linhasSangria, ...linhasPagamento] },
      },
    });

    if (aprovado) {
      const dataBR = data.toISOString().slice(0, 10).split("-").reverse().join("/");
      await prisma.transaction.create({
        data: {
          date: data, amount: totalS, type: "INCOME",
          description: `Sangrias do caixa — ${dataBR}`,
          companyId, accountId: caixa.id, categoryId: catSangria.id,
          source: "MANUAL", cashClosingId: fechamento.id,
        },
      });
      if (totalP > 0) {
        await prisma.transaction.create({
          data: {
            date: data, amount: totalP, type: "EXPENSE",
            description: `Pagamentos em dinheiro — ${dataBR}`,
            companyId, accountId: caixa.id, categoryId: catPagamento.id,
            source: "MANUAL", cashClosingId: fechamento.id,
          },
        });
      }
    }
    fechamentos++;
  }
  console.log(`  fechamentos de caixa: ${fechamentos}`);

  // ---------- Catálogo de serviços ----------
  const itensDefs: { name: string; category: "CONSULTA" | "EXAME" | "PROCEDIMENTO" | "PLANTAO"; price: number | null; operationalCost: number; group: string | null }[] = [
    { name: "Consulta Particular", category: "CONSULTA", price: 250, operationalCost: 18, group: "Consultas" },
    { name: "Consulta Convênio", category: "CONSULTA", price: 120, operationalCost: 18, group: "Consultas" },
    { name: "Ultrassonografia Abdominal", category: "EXAME", price: 210, operationalCost: 34, group: "US" },
    { name: "Ultrassonografia Obstétrica", category: "EXAME", price: 230, operationalCost: 34, group: "US" },
    { name: "Eletrocardiograma", category: "EXAME", price: 95, operationalCost: 12, group: "ECG e similares" },
    { name: "Teste Ergométrico", category: "EXAME", price: 320, operationalCost: 48, group: "ECG e similares" },
    { name: "Infiltração Articular", category: "PROCEDIMENTO", price: 480, operationalCost: 96, group: "Ortopédicos" },
    { name: "Drenagem de Abscesso", category: "PROCEDIMENTO", price: 380, operationalCost: 72, group: "Proced de baixo custo" },
    { name: "Plantão 12h", category: "PLANTAO", price: null, operationalCost: 0, group: "Plantões" },
  ];
  const itens = new Map<string, string>();
  for (const it of itensDefs) {
    const existente = await prisma.serviceItem.findFirst({ where: { companyId, name: it.name } });
    const salvo = existente ?? (await prisma.serviceItem.create({ data: { ...it, companyId, payer: null } }));
    itens.set(it.name, salvo.id);
  }
  console.log(`  itens de catálogo: ${itens.size}`);

  // Faixas de encargos, que alimentam a margem em Operação.
  if ((await prisma.taxBracket.count({ where: { companyId } })) === 0) {
    await prisma.taxBracket.createMany({
      data: [
        { companyId, minValue: 0, maxValue: 150, percent: 12.5, notes: "Faixa de menor valor" },
        { companyId, minValue: 150.01, maxValue: 400, percent: 10.8, notes: null },
        { companyId, minValue: 400.01, maxValue: null, percent: 9.4, notes: "Acima de R$ 400" },
      ],
    });
  }

  // ---------- Médicos, contratos e lançamentos ----------
  const medicosDefs: { name: string; specialty: string; contrato: { item: string; rate: number }[] }[] = [
    { name: "Dra. Helane Martins", specialty: "Ginecologia", contrato: [{ item: "Consulta Particular", rate: 120 }, { item: "Consulta Convênio", rate: 58 }, { item: "Ultrassonografia Obstétrica", rate: 92 }] },
    { name: "Dr. Rafael Bittencourt", specialty: "Cardiologia", contrato: [{ item: "Consulta Particular", rate: 130 }, { item: "Eletrocardiograma", rate: 42 }, { item: "Teste Ergométrico", rate: 145 }] },
    { name: "Dra. Camila Prudente", specialty: "Clínica Geral", contrato: [{ item: "Consulta Convênio", rate: 55 }, { item: "Consulta Particular", rate: 115 }] },
    { name: "Dr. Anderson Koerich", specialty: "Ortopedia", contrato: [{ item: "Consulta Particular", rate: 135 }, { item: "Infiltração Articular", rate: 210 }] },
    { name: "Dra. Juliana Espíndola", specialty: "Radiologia", contrato: [{ item: "Ultrassonografia Abdominal", rate: 88 }, { item: "Ultrassonografia Obstétrica", rate: 92 }] },
    { name: "Dr. Marcelo Tavares", specialty: "Plantonista", contrato: [{ item: "Plantão 12h", rate: 1400 }] },
  ];

  const DESDE = dia("2026-01-01");
  let lancamentos = 0;

  for (const [im, m] of medicosDefs.entries()) {
    let medico = await prisma.doctor.findFirst({ where: { companyId, name: m.name } });
    if (!medico) {
      medico = await prisma.doctor.create({
        data: {
          companyId,
          name: m.name,
          specialty: m.specialty,
          serviceRates: {
            create: m.contrato.map((c) => ({
              serviceItemId: itens.get(c.item)!,
              rate: c.rate,
              validFrom: DESDE,
              lastCheckedAt: dia("2026-08-01"),
            })),
          },
        },
      });
    }

    // Dias de atendimento nos últimos meses, com detalhe por item — é o
    // detalhamento que destrava as métricas de conversão em Operação.
    for (const [i, { ano, mes }] of MESES.entries()) {
      for (const d of [6, 13, 21]) {
        const data = dia(`${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
        if (await prisma.doctorDailyEntry.findFirst({ where: { companyId, doctorId: medico.id, date: data } })) continue;

        const linhas = m.contrato.map((c, j) => ({
          serviceItemId: itens.get(c.item)!,
          quantity: c.item === "Plantão 12h" ? 1 : Math.max(1, Math.round(3 + Math.sin(i + j + im) * 2)),
          rate: c.rate,
        }));

        await prisma.doctorDailyEntry.create({
          data: {
            date: data,
            companyId,
            doctorId: medico.id,
            paid: false,
            lines: { create: linhas },
          },
        });
        lancamentos++;
      }
    }
  }
  console.log(`  médicos: ${medicosDefs.length} · lançamentos de repasse: ${lancamentos}`);

  // ---------- Repasses aprovados dos meses fechados ----------
  const catRepasse =
    (await prisma.category.findFirst({ where: { companyId, name: "Repasse Médico", type: "EXPENSE" } })) ??
    (await prisma.category.create({ data: { companyId, name: "Repasse Médico", type: "EXPENSE" } }));

  let aprovados = 0;
  // Deixa os dois últimos meses PENDENTES, para a fila de aprovação ter o
  // que mostrar.
  for (const { ano, mes } of MESES.slice(0, 4)) {
    const inicio = dia(`${ano}-${String(mes).padStart(2, "0")}-01`);
    const fim = ultimoDia(ano, mes);

    for (const medico of await prisma.doctor.findMany({ where: { companyId } })) {
      const pendentes = await prisma.doctorDailyEntry.findMany({
        where: { companyId, doctorId: medico.id, payoutId: null, date: { gte: inicio, lte: fim } },
        include: { lines: true },
      });
      if (pendentes.length === 0) continue;

      const total = pendentes.reduce(
        (s, e) => s + (e.amount != null ? Number(e.amount) : e.lines.reduce((a, l) => a + Number(l.quantity) * Number(l.rate), 0)),
        0
      );
      if (total <= 0) continue;

      const transacao = await prisma.transaction.create({
        data: {
          date: fim,
          amount: total,
          type: "EXPENSE",
          description: `Repasse — ${medico.name} — ${String(mes).padStart(2, "0")}/${ano}`,
          companyId,
          accountId: contaCorrente.id,
          categoryId: catRepasse.id,
          source: "MANUAL",
        },
      });
      const payout = await prisma.doctorPayout.create({
        data: {
          month: inicio,
          amount: total,
          companyId,
          doctorId: medico.id,
          transactionId: transacao.id,
          approvedAt: fim,
          approvedByName: "Davi Gentil",
        },
      });
      await prisma.doctorDailyEntry.updateMany({
        where: { id: { in: pendentes.map((e) => e.id) } },
        data: { payoutId: payout.id, paid: true },
      });
      aprovados++;
    }
  }
  console.log(`  repasses aprovados: ${aprovados}`);

  console.log("Pronto.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
