import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/** Onde o Windows costuma instalar o PostgreSQL. */
const RAIZ_WINDOWS = "C:/Program Files/PostgreSQL";

/** Encontra um utilitário do Postgres (pg_dump, pg_restore, psql).
 *
 * Procura no PATH primeiro e só então no diretório de instalação: no
 * Windows o instalador não põe o `bin` no PATH, e um script de backup que
 * só funciona em máquina configurada à mão não serve para o que existe. */
export function acharBinario(nome: string): string {
  try {
    execFileSync(nome, ["--version"], { stdio: "ignore" });
    return nome;
  } catch {
    // Não está no PATH; procura na instalação.
  }

  if (existsSync(RAIZ_WINDOWS)) {
    // Da versão maior para a menor: a mais nova lê bancos antigos, o
    // contrário não — pg_dump recusa servidor mais novo que ele.
    const versoes = readdirSync(RAIZ_WINDOWS).sort((a, b) => Number(b) - Number(a));
    for (const versao of versoes) {
      const caminho = join(RAIZ_WINDOWS, versao, "bin", `${nome}.exe`);
      if (existsSync(caminho)) return caminho;
    }
  }

  throw new Error(
    `${nome} não encontrado. Instale as ferramentas de linha de comando do PostgreSQL ` +
      `(winget install PostgreSQL.PostgreSQL.17) ou ponha a pasta bin no PATH.`
  );
}
