import "dotenv/config";
import { config as carregarEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { acharBinario } from "./postgres-bin";

carregarEnv({ path: ".env.test" });

const PASTA = "backups";
const BANCO_DE_CONFERENCIA = "fluxojr_backup_check";

/** Restaura o backup mais recente num banco descartável e confere se os
 * dados chegaram inteiros.
 *
 * Existe porque backup que nunca foi restaurado não é backup, é um arquivo:
 * o `pg_dump` termina com sucesso mesmo quando a versão do cliente, a
 * codificação ou uma permissão vão estragar a restauração — e isso só
 * aparece no dia em que se precisa dele. Aqui aparece antes.
 *
 * A conferência é contagem de linhas por tabela, das duas pontas. Não prova
 * que todo campo veio igual, mas pega o que de fato acontece na prática:
 * tabela que não restaurou, restaurou vazia ou restaurou pela metade. */

function bin(nome: string) {
  return acharBinario(nome);
}

function ultimoBackup() {
  if (!existsSync(PASTA)) throw new Error(`Pasta ${PASTA}/ não existe. Rode \`npm run db:backup\` antes.`);
  const arquivos = readdirSync(PASTA).filter((f) => f.endsWith(".dump")).sort();
  const ultimo = arquivos.at(-1);
  if (!ultimo) throw new Error(`Nenhum .dump em ${PASTA}/. Rode \`npm run db:backup\` antes.`);
  return join(PASTA, ultimo);
}

/** Conta as linhas de cada tabela do schema public. */
function contarLinhas(url: string): Map<string, number> {
  const sql = `
    select relname, n_live_tup
    from pg_stat_user_tables
    where schemaname = 'public'
    order by relname;
  `;
  // n_live_tup é estimativa do planejador; para conferência precisa do
  // count() de verdade, então ele serve só para descobrir as tabelas.
  const nomes = execFileSync(bin("psql"), [url, "-tAc", sql], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((linha) => linha.split("|")[0]);

  if (nomes.length === 0) return new Map();

  const contagens = nomes.map((t) => `select '${t}' as tabela, count(*)::text as n from "${t}"`).join(" union all ");
  const saida = execFileSync(bin("psql"), [url, "-tAc", contagens], { encoding: "utf8" });

  return new Map(
    saida
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((linha) => {
        const [tabela, n] = linha.split("|");
        return [tabela, Number(n)] as const;
      })
  );
}

function urlAdministrativa(base: string, banco: string) {
  const u = new URL(base);
  u.pathname = `/${banco}`;
  return u.toString();
}

const origem = process.env.DATABASE_URL;
const local = process.env.DATABASE_URL_TEST;
if (!origem) throw new Error("DATABASE_URL não definida.");
if (!local) throw new Error("DATABASE_URL_TEST não definida — é o Postgres local onde a restauração é testada.");

const arquivo = ultimoBackup();
const urlPostgres = urlAdministrativa(local, "postgres");
const urlConferencia = urlAdministrativa(local, BANCO_DE_CONFERENCIA);

console.log(`Backup:      ${arquivo}`);
console.log(`Restaurando em: ${new URL(urlConferencia).hostname}/${BANCO_DE_CONFERENCIA}\n`);

// Banco descartável e recriado do zero: restaurar por cima de dados
// antigos esconderia justamente a tabela que não veio no backup.
execFileSync(bin("psql"), [urlPostgres, "-qc", `drop database if exists ${BANCO_DE_CONFERENCIA} with (force)`], {
  stdio: ["ignore", "ignore", "inherit"],
});
execFileSync(bin("psql"), [urlPostgres, "-qc", `create database ${BANCO_DE_CONFERENCIA}`], {
  stdio: ["ignore", "ignore", "inherit"],
});

// O dump traz `CREATE SCHEMA public`, que falha num banco recém-criado
// porque o Postgres já vem com ele. Derrubar o schema antes deixa a
// restauração recriar tudo do zero — e, principalmente, mantém a
// checagem de erro rígida: assim qualquer falha do `pg_restore` a partir
// daqui é problema de verdade no backup, e não ruído esperado.
execFileSync(bin("psql"), [urlConferencia, "-qc", "drop schema if exists public cascade"], {
  stdio: ["ignore", "ignore", "inherit"],
});

try {
  execFileSync(bin("pg_restore"), ["--dbname", urlConferencia, "--no-owner", "--no-acl", arquivo], {
    stdio: ["ignore", "inherit", "inherit"],
  });

  const esperado = contarLinhas(origem);
  const restaurado = contarLinhas(urlConferencia);

  const tabelas = [...new Set([...esperado.keys(), ...restaurado.keys()])].sort();
  const divergentes: string[] = [];
  let totalLinhas = 0;

  console.log("\nTabela                        origem   restaurado");
  console.log("--------------------------------------------------");
  for (const tabela of tabelas) {
    const a = esperado.get(tabela) ?? 0;
    const b = restaurado.get(tabela) ?? 0;
    totalLinhas += b;
    const marca = a === b ? " " : "  <-- DIVERGE";
    if (a !== b) divergentes.push(tabela);
    console.log(`${tabela.padEnd(28)} ${String(a).padStart(7)} ${String(b).padStart(11)}${marca}`);
  }

  console.log("--------------------------------------------------");
  console.log(`${tabelas.length} tabelas, ${totalLinhas} linhas restauradas.`);

  if (divergentes.length > 0) {
    console.error(`\nBACKUP NAO CONFERE em: ${divergentes.join(", ")}`);
    console.error("Nao confie neste arquivo. Refaca o backup e rode esta conferencia de novo.");
    process.exitCode = 1;
  } else {
    console.log("\nBackup confere: restaurou inteiro, tabela por tabela.");
  }
} finally {
  // O banco de conferência guarda uma cópia dos dados reais; some junto
  // com o teste em vez de ficar esquecido na máquina.
  execFileSync(bin("psql"), [urlPostgres, "-qc", `drop database if exists ${BANCO_DE_CONFERENCIA} with (force)`], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}
