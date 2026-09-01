-- Registro dos erros que estouram em producao.
--
-- Ate aqui as telas de erro nao reportavam para lugar nenhum: um erro as 9h
-- da manha so era descoberto se a pessoa avisasse. Com uma unica pessoa dando
-- suporte ao sistema inteiro, isso e o mesmo que nao saber.
--
-- `digest` e o codigo que a tela mostra ao usuario, e o que liga o print que
-- ele manda a linha daqui.

CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "digest" TEXT,
    "stack" TEXT,
    "route" TEXT,
    "method" TEXT,
    "seen" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErrorLog_at_idx" ON "ErrorLog"("at");
CREATE INDEX "ErrorLog_seen_idx" ON "ErrorLog"("seen");
