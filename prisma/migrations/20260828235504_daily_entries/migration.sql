-- Lancamento diario (substitui o mensal)
--
-- As 83 planilhas reais por medico registram UMA LINHA POR DIA com o valor
-- daquele dia ("07/10  R$332"), agrupadas numa aba por mes. O lancamento
-- mensal que existia aqui foi desenhado antes de termos esses arquivos e
-- nao corresponde a operacao.
--
-- Alem do dia, o lancamento passa a aceitar valor digitado direto
-- (`amount`) — 98% dos 2.594 lancamentos reais nao tem detalhe por item,
-- so o total do dia. As linhas continuam existindo para quem detalhar, e
-- sao elas que devolvem a quantidade que alimenta a taxa de conversao.

-- 1. Renomeia as tabelas
ALTER TABLE "DoctorPeriodReport" RENAME TO "DoctorDailyEntry";
ALTER TABLE "DoctorPeriodLine" RENAME TO "DoctorDailyLine";

-- 2. competencia (1o dia do mes) vira a data do lancamento
ALTER TABLE "DoctorDailyEntry" RENAME COLUMN "competencia" TO "date";
ALTER TABLE "DoctorDailyLine" RENAME COLUMN "reportId" TO "entryId";

-- 3. Constraints e indices com os nomes que o Prisma espera
ALTER TABLE "DoctorDailyEntry" RENAME CONSTRAINT "DoctorPeriodReport_pkey" TO "DoctorDailyEntry_pkey";
ALTER TABLE "DoctorDailyEntry" RENAME CONSTRAINT "DoctorPeriodReport_doctorId_fkey" TO "DoctorDailyEntry_doctorId_fkey";
ALTER TABLE "DoctorDailyEntry" RENAME CONSTRAINT "DoctorPeriodReport_companyId_fkey" TO "DoctorDailyEntry_companyId_fkey";

ALTER TABLE "DoctorDailyLine" RENAME CONSTRAINT "DoctorPeriodLine_pkey" TO "DoctorDailyLine_pkey";
ALTER TABLE "DoctorDailyLine" RENAME CONSTRAINT "DoctorPeriodLine_reportId_fkey" TO "DoctorDailyLine_entryId_fkey";
ALTER TABLE "DoctorDailyLine" RENAME CONSTRAINT "DoctorPeriodLine_serviceItemId_fkey" TO "DoctorDailyLine_serviceItemId_fkey";
ALTER INDEX "DoctorPeriodLine_reportId_serviceItemId_key" RENAME TO "DoctorDailyLine_entryId_serviceItemId_key";

-- 4. Um medico pode ter mais de um lancamento no mesmo dia (nos dados
-- reais sao 7 casos, de blocos diferentes da planilha) — a antiga unica
-- por (medico, competencia) nao vale mais.
ALTER TABLE "DoctorDailyEntry" DROP CONSTRAINT IF EXISTS "DoctorPeriodReport_doctorId_competencia_key";
DROP INDEX IF EXISTS "DoctorPeriodReport_doctorId_competencia_key";

-- 5. Campos novos
ALTER TABLE "DoctorDailyEntry" ADD COLUMN "amount" DECIMAL(14,2);
ALTER TABLE "DoctorDailyEntry" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "DoctorDailyEntry_companyId_date_idx" ON "DoctorDailyEntry"("companyId", "date");
CREATE INDEX "DoctorDailyEntry_doctorId_date_idx" ON "DoctorDailyEntry"("doctorId", "date");
