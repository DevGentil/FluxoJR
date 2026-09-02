-- Repasse aprovado: o lote de um medico num mes que o financeiro liberou
-- e que virou despesa no razao.
--
-- A unidade e MEDICO x MES, e nao o lancamento do dia, porque e assim que
-- o dinheiro sai: um pagamento por medico por mes. Uma transacao por dia
-- lancado poria milhares de linhas no razao para representar um pagamento
-- so, e o extrato deixaria de ser legivel.
CREATE TABLE "DoctorPayout" (
  "id"             TEXT NOT NULL,
  "month"          TIMESTAMP(3) NOT NULL,
  "amount"         DECIMAL(14,2) NOT NULL,
  "approvedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Nome copiado, como em PeriodClosing e no fechamento de caixa: a
  -- aprovacao precisa continuar respondendo "quem autorizou" depois que a
  -- conta sair.
  "approvedByName" TEXT,
  "approvedById"   TEXT,
  "companyId"      TEXT NOT NULL,
  "doctorId"       TEXT NOT NULL,
  "transactionId"  TEXT,
  CONSTRAINT "DoctorPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DoctorPayout_companyId_doctorId_month_key"
  ON "DoctorPayout"("companyId", "doctorId", "month");
CREATE UNIQUE INDEX "DoctorPayout_transactionId_key" ON "DoctorPayout"("transactionId");
CREATE INDEX "DoctorPayout_companyId_month_idx" ON "DoctorPayout"("companyId", "month");

ALTER TABLE "DoctorPayout"
  ADD CONSTRAINT "DoctorPayout_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorPayout"
  ADD CONSTRAINT "DoctorPayout_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL e nao CASCADE: apagar a transacao a mao nao pode fazer o
-- registro da aprovacao desaparecer junto.
ALTER TABLE "DoctorPayout"
  ADD CONSTRAINT "DoctorPayout_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O lancamento do dia passa a saber a que repasse aprovado pertence. Nulo
-- = ainda nao aprovado, que e como todos os 2.483 existentes comecam.
ALTER TABLE "DoctorDailyEntry" ADD COLUMN "payoutId" TEXT;
ALTER TABLE "DoctorDailyEntry"
  ADD CONSTRAINT "DoctorDailyEntry_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "DoctorPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DoctorDailyEntry_payoutId_idx" ON "DoctorDailyEntry"("payoutId");
