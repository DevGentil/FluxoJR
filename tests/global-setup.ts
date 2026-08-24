import "dotenv/config";
import { config } from "dotenv";
import { execSync } from "node:child_process";

// Roda uma única vez, antes de toda a suíte, num processo separado.
config({ path: ".env.test", override: true });

const url = process.env.DATABASE_URL_TEST;

if (!url) {
  throw new Error("DATABASE_URL_TEST não configurado. Veja .env.test.example.");
}

// Trava de segurança: nunca deixa os testes (que apagam dados a cada teste)
// rodarem sem querer contra o banco de dev/produção.
if (!/test/i.test(url)) {
  throw new Error(
    `DATABASE_URL_TEST não parece apontar para um banco de teste ("${url}"). ` +
      'O nome do banco precisa conter "test" como proteção contra apagar dados reais.'
  );
}

export default function globalSetup() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
