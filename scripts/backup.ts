import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { acharBinario } from "./postgres-bin";

const PASTA = "backups";

/** Nome ordenável por si só: listar a pasta já mostra do mais antigo ao
 * mais novo, sem depender da data do arquivo (que uma cópia entre discos
 * perde). */
function nomeDoArquivo(agora: Date) {
  const [data, hora] = agora.toISOString().split("T");
  return `fluxojr-${data}-${hora.slice(0, 5).replace(":", "")}.dump`;
}

function formatarTamanho(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida.");

mkdirSync(PASTA, { recursive: true });
const destino = join(PASTA, nomeDoArquivo(new Date()));

console.log(`Banco:   ${new URL(url).hostname}`);
console.log(`Destino: ${destino}`);
console.log("Copiando...");

execFileSync(
  acharBinario("pg_dump"),
  [
    url,
    "--format=custom", // permite restaurar tabelas isoladas, e comprime
    "--schema=public", // as outras (auth, storage) são do Supabase e exigem superusuário
    "--no-owner", // o dono no Supabase não existe na máquina que restaura
    "--no-acl",
    "--file",
    destino,
  ],
  { stdio: ["ignore", "inherit", "inherit"] }
);

console.log(`\nPronto: ${destino} (${formatarTamanho(statSync(destino).size)})`);
console.log("Um backup só vale depois de restaurado: rode `npm run db:backup:verificar`.");
