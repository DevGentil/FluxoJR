import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Os testes de integração compartilham um único banco de teste real —
    // rodar arquivos em paralelo faria um `resetDb()` apagar dados que outro
    // arquivo ainda está usando.
    fileParallelism: false,
  },
});
