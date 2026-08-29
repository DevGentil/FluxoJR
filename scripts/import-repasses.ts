/**
 * Importa os repasses médicos reais das planilhas consolidadas da unidade
 * para dentro do sistema: médicos, contrato de cada um e os dias lançados.
 *
 * Roda em modo simulação por padrão — mostra o que faria e não grava nada.
 * Só com `--confirmar` ele escreve no banco.
 *
 *   npx tsx --env-file=.env scripts/import-repasses.ts --empresa "AS Contagem"
 *   npx tsx --env-file=.env scripts/import-repasses.ts --empresa "AS Contagem" --confirmar
 *
 * Opções:
 *   --empresa <nome>    empresa de destino (obrigatório)
 *   --desde YYYY-MM-DD  ignora lançamentos anteriores (padrão 2026-01-01)
 *   --apagar-demo       remove antes os médicos e lançamentos que já existem
 *                       na empresa (usar quando forem dados de demonstração)
 *   --confirmar         grava de verdade
 */
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/date-only";

const PLANILHAS = {
  especialistas: "C:/Users/Davi Gentil/Downloads/medicos_especialistas_consolidado.xlsx",
  ultrassom: "C:/Users/Davi Gentil/Downloads/medicos_ultrassom_consolidado.xlsx",
};

type Payer = "CT" | "PARTICULAR" | null;
type Categoria = "CONSULTA" | "EXAME" | "PROCEDIMENTO" | "PLANTAO" | "OUTRO";

interface Lancamento {
  dia: string;
  medico: string;
  valor: number;
  pago: boolean;
  notas: string | null;
}

interface Contrato {
  medico: string;
  procedimento: string;
  payer: Payer;
  valor: number;
  ocorrencias: number;
}

interface MedicoInfo {
  nome: string;
  especialidade: string;
  notas: string | null;
}

// ---------------------------------------------------------------- utilidades

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (nome: string) => process.argv.includes(`--${nome}`);

/** Chave de comparação de nomes: sem acento, sem caixa, sem pontuação. É o
 * que faz "Raio X", "Raio-x" e "Raio x" caírem no mesmo item do catálogo. */
function chave(texto: string) {
  return texto
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function diaDe(v: unknown): string | null {
  if (!(v instanceof Date) || isNaN(v.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  // A planilha entrega a data na meia-noite local; o dia é o que importa.
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
}

function texto(v: unknown): string {
  return String(v ?? "").trim();
}

/** A natureza do item, deduzida do nome. O catálogo usa isso para separar
 * consulta de exame nas métricas de conversão. */
function categoriaDe(nome: string): Categoria {
  const k = chave(nome);
  if (/\bplantao\b|\bhora\b/.test(k)) return "PLANTAO";
  if (/\bconsulta\b|\bpre natal\b|\brisco cirurgico\b/.test(k)) return "CONSULTA";
  if (
    /\becg\b|\braio ?-?x\b|\bcovid\b|\bcampo visual\b|\bretinografia\b|\bmapeamento\b|\bteste\b|\bdoppler\b|\busg\b|\bultrassom\b|\beco|\babdome\b|\bcarotidas\b|\bendovaginal\b|\btransvaginal\b|\bmorfologico\b|\bobstetrico\b|\bmamas\b|\bduplex\b|\bcdpo\b|\barticulacao\b|\btn com\b|\bholter\b|\bespirometria\b/.test(
      k
    )
  ) {
    return "EXAME";
  }
  if (/\bauxilio\b|\bcombustivel\b/.test(k)) return "OUTRO";
  return "PROCEDIMENTO";
}

function payerDe(categoria: string): Payer {
  const k = chave(categoria);
  if (k.includes("cartao de todos")) return "CT";
  if (k.includes("particular")) return "PARTICULAR";
  return null;
}

const ler = (caminho: string, aba: string) =>
  XLSX.utils.sheet_to_json<Record<string, unknown>>(
    XLSX.readFile(caminho, { cellDates: true }).Sheets[aba],
    { defval: "" }
  );

// ------------------------------------------------------------------- leitura

function lerLancamentos(desde: string): Lancamento[] {
  const saida: Lancamento[] = [];

  for (const [caminho, ehUltrassom] of [
    [PLANILHAS.especialistas, false],
    [PLANILHAS.ultrassom, true],
  ] as const) {
    for (const r of ler(caminho, "Lançamentos")) {
      const dia = diaDe(r["Data"]);
      const valor = Number(r["Valor"]);
      if (!dia || dia < desde || !Number.isFinite(valor) || valor <= 0) continue;

      const bloco = texto(r["Bloco / Tipo"] ?? r["Tipo / Bloco"]);
      const obs = texto(r["Observação"]);
      const horas = texto(r["Qt. Horas"]);
      const duplicidade = texto(r["Possível duplicidade"]);

      // "PG" na observação (especialistas) e o bloco "PAGOS" (ultrassom) são
      // as duas formas que a planilha usa para dizer a mesma coisa.
      const pago = /^(pg|pago)/i.test(obs) || chave(bloco) === "pagos";

      const notas = [
        bloco && chave(bloco) !== "principal" ? bloco : "",
        obs && !/^(pg|pago)$/i.test(obs) ? obs : "",
        horas ? `${horas} h` : "",
        duplicidade ? `Possível duplicidade na planilha: ${duplicidade}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      saida.push({
        dia,
        medico: texto(r["Médico"]),
        valor,
        pago,
        notas: notas || null,
      });
      void ehUltrassom;
    }
  }
  return saida.filter((l) => l.medico);
}

function lerContratos(): Contrato[] {
  const saida: Contrato[] = [];

  for (const r of ler(PLANILHAS.especialistas, "Repasses")) {
    const valor = Number(r["Valor de repasse"]);
    const procedimento = texto(r["Procedimento"]);
    if (!procedimento || !Number.isFinite(valor) || valor <= 0) continue;
    saida.push({
      medico: texto(r["Médico"]),
      procedimento,
      payer: payerDe(texto(r["Categoria"])),
      valor,
      ocorrencias: Number(r["Ocorrências nas abas"]) || 0,
    });
  }

  for (const r of ler(PLANILHAS.ultrassom, "Repasses")) {
    const valor = Number(r["Valor de repasse"]);
    const procedimento = texto(r["Procedimento / Exame"]);
    if (!procedimento || !Number.isFinite(valor) || valor <= 0) continue;
    saida.push({
      medico: texto(r["Médico"]),
      procedimento,
      payer: null,
      valor,
      ocorrencias: Number(r["Ocorrências nas abas"]) || 0,
    });
  }

  return saida.filter((c) => c.medico);
}

function lerMedicos(): Map<string, MedicoInfo> {
  const mapa = new Map<string, MedicoInfo>();

  for (const [caminho, colServico] of [
    [PLANILHAS.especialistas, "Especialidade"],
    [PLANILHAS.ultrassom, "Serviço"],
  ] as const) {
    for (const r of ler(caminho, "Médicos e Regras")) {
      const nome = texto(r["Médico"]);
      if (!nome) continue;
      const notas = [texto(r["Regra de pagamento"]), texto(r["Outras observações"])]
        .filter(Boolean)
        .join(" · ");
      mapa.set(chave(nome), {
        nome,
        especialidade: texto(r[colServico]) || "Não informada",
        notas: notas || null,
      });
    }
  }
  return mapa;
}

// -------------------------------------------------------------------- import

async function main() {
  const nomeEmpresa = arg("empresa");
  const desde = arg("desde") ?? "2026-01-01";
  const apagarDemo = flag("apagar-demo");
  const confirmar = flag("confirmar");

  if (!nomeEmpresa) {
    console.error('Informe a empresa: --empresa "AS Contagem"');
    process.exit(1);
  }

  const empresa = await prisma.company.findFirst({ where: { name: nomeEmpresa } });
  if (!empresa) {
    console.error(`Empresa "${nomeEmpresa}" não encontrada.`);
    process.exit(1);
  }

  const lancamentos = lerLancamentos(desde);
  const contratos = lerContratos();
  const infoMedicos = lerMedicos();

  // --- médicos: todo nome que aparece em lançamento ou contrato
  const nomesUsados = new Map<string, string>();
  for (const l of lancamentos) nomesUsados.set(chave(l.medico), l.medico);
  for (const c of contratos) if (!nomesUsados.has(chave(c.medico))) nomesUsados.set(chave(c.medico), c.medico);

  // --- catálogo: um item por (procedimento, convênio). O nome mostrado é a
  // grafia que mais aparece, para não fixar "Aplicaçao" quando "Aplicação"
  // é o comum.
  const itensPlan = new Map<string, { nome: string; payer: Payer; peso: number; categoria: Categoria }>();
  for (const c of contratos) {
    const k = `${chave(c.procedimento)}|${c.payer ?? ""}`;
    const atual = itensPlan.get(k);
    if (!atual || c.ocorrencias > atual.peso) {
      itensPlan.set(k, {
        nome: c.procedimento,
        payer: c.payer,
        peso: c.ocorrencias,
        categoria: categoriaDe(c.procedimento),
      });
    }
  }

  // --- contrato de cada médico: um valor por item. Grafias diferentes do
  // mesmo procedimento colapsam; fica a que aparece em mais abas.
  const contratoPorMedico = new Map<string, Map<string, Contrato>>();
  for (const c of contratos) {
    const kMed = chave(c.medico);
    const kItem = `${chave(c.procedimento)}|${c.payer ?? ""}`;
    const doMedico = contratoPorMedico.get(kMed) ?? new Map<string, Contrato>();
    const atual = doMedico.get(kItem);
    if (!atual || c.ocorrencias > atual.ocorrencias) doMedico.set(kItem, c);
    contratoPorMedico.set(kMed, doMedico);
  }

  const catalogoExistente = await prisma.serviceItem.findMany({
    where: { companyId: empresa.id },
    select: { id: true, name: true, payer: true, operationalCost: true, group: true },
  });
  const itemPorChave = new Map(catalogoExistente.map((i) => [`${chave(i.name)}|${i.payer ?? ""}`, i.id]));
  const itensNovos = [...itensPlan.entries()].filter(([k]) => !itemPorChave.has(k));

  // O catálogo que já existe tem custo de insumo e grupo operacional levantados
  // das planilhas de exame — dado que a aba de Repasses não traz. Item novo com
  // o MESMO nome herda os dois. O preço cobrado não: ele muda entre Cartão de
  // Todos e Particular, e a planilha de repasse não diz qual é qual.
  const custoPorNome = new Map(
    catalogoExistente.map((i) => [chave(i.name), { custo: Number(i.operationalCost), grupo: i.group }])
  );
  const herdam = itensNovos.filter(([, i]) => custoPorNome.has(chave(i.nome))).length;

  // O catálogo é único por (empresa, NOME) — o convênio não entra na chave.
  // Então o mesmo procedimento com preço de Cartão de Todos e de Particular
  // precisa de nomes diferentes, que é a convenção que a unidade já usa
  // ("Consulta CT", "Consulta P (demais)"). Só desempata quem colide.
  const SUFIXO: Record<string, string> = { CT: " (CT)", PARTICULAR: " (Particular)" };
  const nomesTomados = new Set(catalogoExistente.map((i) => chave(i.name)));
  const nomeFinal = new Map<string, string>();
  for (const [k, i] of itensNovos) {
    let nome = i.nome;
    if (nomesTomados.has(chave(nome)) && i.payer) nome = `${i.nome}${SUFIXO[i.payer]}`;
    let n = 2;
    while (nomesTomados.has(chave(nome))) nome = `${i.nome} ${n++}`;
    nomesTomados.add(chave(nome));
    nomeFinal.set(k, nome);
  }
  const desempatados = [...nomeFinal.entries()].filter(
    ([k, nome]) => nome !== itensPlan.get(k)!.nome
  ).length;

  if (flag("detalhar")) {
    console.log("\nItens de catálogo que seriam criados:");
    for (const [k, i] of [...itensNovos].sort((a, b) => a[1].nome.localeCompare(b[1].nome))) {
      const herda = custoPorNome.get(chave(i.nome));
      console.log(
        `  ${(nomeFinal.get(k) ?? i.nome).padEnd(32)} ${String(i.payer ?? "—").padEnd(11)} ${i.categoria.padEnd(13)}` +
          (herda ? ` herda custo ${herda.custo} / grupo ${herda.grupo ?? "—"}` : "")
      );
    }
  }

  const totalValor = lancamentos.reduce((s, l) => s + l.valor, 0);
  const totalContratos = [...contratoPorMedico.values()].reduce((s, m) => s + m.size, 0);

  const demoMedicos = await prisma.doctor.count({ where: { companyId: empresa.id } });
  const demoLancamentos = await prisma.doctorDailyEntry.count({ where: { companyId: empresa.id } });

  console.log(`\nEmpresa de destino: ${empresa.name}`);
  console.log(`Lançamentos a partir de ${desde}`);
  console.log(`─────────────────────────────────────────────`);
  if (apagarDemo) {
    console.log(`  apagar antes:      ${demoMedicos} médico(s) e ${demoLancamentos} lançamento(s) já existentes`);
  }
  console.log(`  médicos:           ${nomesUsados.size}`);
  console.log(`  itens de catálogo: ${itensNovos.length} novos, ${herdam} herdando custo/grupo do catálogo atual (${catalogoExistente.length} itens já cadastrados)`);
  if (desempatados > 0) {
    console.log(`  ${desempatados} item(ns) ganham sufixo de convênio para não colidir de nome`);
  }
  console.log(`  linhas de contrato:${String(totalContratos).padStart(6)}`);
  console.log(`  lançamentos:       ${lancamentos.length}`);
  console.log(`  soma dos valores:  R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`  já pagos:          ${lancamentos.filter((l) => l.pago).length}`);
  console.log(`  com observação:    ${lancamentos.filter((l) => l.notas).length}`);

  if (!confirmar) {
    console.log(`\n(simulação — nada foi gravado. Rode de novo com --confirmar para aplicar.)`);
    await prisma.$disconnect();
    return;
  }

  const vigencia = parseDateOnly(desde);

  await prisma.$transaction(
    async (tx) => {
      if (apagarDemo) {
        // As linhas de lançamento e o contrato saem em cascata com o médico.
        await tx.doctorDailyEntry.deleteMany({ where: { companyId: empresa.id } });
        await tx.doctor.deleteMany({ where: { companyId: empresa.id } });
      }

      if (itensNovos.length > 0) {
        await tx.serviceItem.createMany({
          data: itensNovos.map(([k, i]) => {
            const herda = custoPorNome.get(chave(i.nome));
            return {
              companyId: empresa.id,
              name: nomeFinal.get(k)!,
              category: i.categoria,
              payer: i.payer,
              operationalCost: herda?.custo ?? 0,
              group: herda?.grupo ?? null,
              active: true,
            };
          }),
        });
      }
      const catalogo = await tx.serviceItem.findMany({
        where: { companyId: empresa.id },
        select: { id: true, name: true, payer: true },
      });
      // Reindexa pelo nome REAL gravado: itens desempatados ganharam sufixo,
      // então a chave da planilha não bate mais com o nome do catálogo.
      const idPorNome = new Map(catalogo.map((i) => [chave(i.name), i.id]));
      const idPorChave = new Map<string, string>();
      for (const [k, i] of itensPlan) {
        const id = idPorNome.get(chave(nomeFinal.get(k) ?? i.nome));
        if (id) idPorChave.set(k, id);
      }

      const idPorMedico = new Map<string, string>();
      for (const [kMed, nome] of nomesUsados) {
        const info = infoMedicos.get(kMed);
        const criado = await tx.doctor.create({
          data: {
            companyId: empresa.id,
            name: nome,
            specialty: info?.especialidade ?? "Não informada",
            notes: info?.notas ?? null,
            active: true,
            serviceRates: {
              create: [...(contratoPorMedico.get(kMed)?.entries() ?? [])].flatMap(([kItem, c]) => {
                const serviceItemId = idPorChave.get(kItem);
                return serviceItemId
                  ? [{ serviceItemId, rate: c.valor, validFrom: vigencia, lastCheckedAt: new Date() }]
                  : [];
              }),
            },
          },
          select: { id: true },
        });
        idPorMedico.set(kMed, criado.id);
      }

      await tx.doctorDailyEntry.createMany({
        data: lancamentos.flatMap((l) => {
          const doctorId = idPorMedico.get(chave(l.medico));
          return doctorId
            ? [
                {
                  companyId: empresa.id,
                  doctorId,
                  date: parseDateOnly(l.dia),
                  amount: l.valor,
                  paid: l.pago,
                  notes: l.notas,
                },
              ]
            : [];
        }),
      });
    },
    { timeout: 300_000, maxWait: 30_000 }
  );

  const [medicosFinal, lancFinal, somaFinal] = await Promise.all([
    prisma.doctor.count({ where: { companyId: empresa.id } }),
    prisma.doctorDailyEntry.count({ where: { companyId: empresa.id } }),
    prisma.doctorDailyEntry.aggregate({ where: { companyId: empresa.id }, _sum: { amount: true } }),
  ]);
  console.log(`\nGravado. Agora a empresa tem:`);
  console.log(`  ${medicosFinal} médicos`);
  console.log(`  ${lancFinal} lançamentos`);
  console.log(`  R$ ${Number(somaFinal._sum.amount ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
