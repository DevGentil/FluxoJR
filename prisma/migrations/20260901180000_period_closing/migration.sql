-- Fechamento de mes por unidade.
--
-- `DoctorDailyEntry.paid` marcava que o repasse foi pago e nao impedia nada:
-- os 1.981 lancamentos ja pagos de janeiro a julho seguiam editaveis e
-- apagaveis por qualquer pessoa com acesso a unidade. Marcar nao e proteger.
--
-- `closedByName` e copia e nao chave estrangeira, pelo mesmo motivo do log de
-- auditoria: quem fechou o mes precisa continuar respondido depois que a
-- conta sair.

CREATE TABLE "PeriodClosing" (
    "id" TEXT NOT NULL,
    -- Primeiro dia do mes, meia-noite UTC — a convencao de data do sistema.
    "month" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByName" TEXT NOT NULL,
    "closedById" TEXT,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "PeriodClosing_pkey" PRIMARY KEY ("id")
);

-- Um fechamento por mes e unidade: dois seria ambiguidade sem resposta.
CREATE UNIQUE INDEX "PeriodClosing_companyId_month_key" ON "PeriodClosing"("companyId", "month");
CREATE INDEX "PeriodClosing_companyId_month_idx" ON "PeriodClosing"("companyId", "month");

ALTER TABLE "PeriodClosing"
  ADD CONSTRAINT "PeriodClosing_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
