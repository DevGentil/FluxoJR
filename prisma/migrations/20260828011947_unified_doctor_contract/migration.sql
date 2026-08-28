-- Contrato unificado do medico (Fase 2)
--
-- Some o "modelo de pagamento" exclusivo (so consulta / consulta+exame /
-- plantao). As planilhas reais mostram medicos que combinam livremente:
-- Frederico Augusto faz plantao E consulta; Rosangela Reis faz plantao E
-- espirometria E raio-x; Leandro Henrique recebe consulta E auxilio
-- combustivel. Agora todo repasse e uma linha em DoctorServiceRate.
--
-- Os dados existentes sao CONVERTIDOS, nao descartados: as taxas de
-- consulta e de plantao viram itens do catalogo com o rate do medico, e os
-- lancamentos viram linhas.

-- 1. A tabela de linhas deixa de ser so de exame
ALTER TABLE "DoctorPeriodExamCount" RENAME TO "DoctorPeriodLine";
ALTER TABLE "DoctorPeriodLine" RENAME COLUMN "count" TO "quantity";
ALTER TABLE "DoctorPeriodLine" ALTER COLUMN "quantity" TYPE DECIMAL(10,2);

ALTER TABLE "DoctorPeriodLine" RENAME CONSTRAINT "DoctorPeriodExamCount_pkey" TO "DoctorPeriodLine_pkey";
ALTER TABLE "DoctorPeriodLine" RENAME CONSTRAINT "DoctorPeriodExamCount_reportId_fkey" TO "DoctorPeriodLine_reportId_fkey";
ALTER TABLE "DoctorPeriodLine" RENAME CONSTRAINT "DoctorPeriodExamCount_serviceItemId_fkey" TO "DoctorPeriodLine_serviceItemId_fkey";
ALTER INDEX "DoctorPeriodExamCount_reportId_serviceItemId_key" RENAME TO "DoctorPeriodLine_reportId_serviceItemId_key";

-- 2. "Ultima conferencia" do contrato
ALTER TABLE "DoctorServiceRate" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);

-- 3. Itens de catalogo para acolher o que hoje e campo fixo no medico
INSERT INTO "ServiceItem" ("id", "name", "category", "operationalCost", "active", "createdAt", "updatedAt", "companyId")
SELECT gen_random_uuid()::text, 'Consulta', 'CONSULTA'::"ServiceCategory", 0, true, NOW(), NOW(), c."id"
FROM "Company" c
WHERE EXISTS (SELECT 1 FROM "Doctor" d WHERE d."companyId" = c."id" AND d."consultationRate" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "ServiceItem" si WHERE si."companyId" = c."id" AND si."name" = 'Consulta');

INSERT INTO "ServiceItem" ("id", "name", "category", "operationalCost", "active", "createdAt", "updatedAt", "companyId")
SELECT gen_random_uuid()::text, 'Plantão (hora)', 'PLANTAO'::"ServiceCategory", 0, true, NOW(), NOW(), c."id"
FROM "Company" c
WHERE EXISTS (SELECT 1 FROM "Doctor" d WHERE d."companyId" = c."id" AND d."hourlyRate" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "ServiceItem" si WHERE si."companyId" = c."id" AND si."name" = 'Plantão (hora)');

-- 4. Taxa de consulta do medico vira linha de contrato
INSERT INTO "DoctorServiceRate" ("id", "rate", "doctorId", "serviceItemId")
SELECT gen_random_uuid()::text, d."consultationRate", d."id", si."id"
FROM "Doctor" d
JOIN "ServiceItem" si ON si."companyId" = d."companyId" AND si."name" = 'Consulta'
WHERE d."consultationRate" IS NOT NULL
ON CONFLICT ("doctorId", "serviceItemId") DO NOTHING;

-- 5. Taxa de plantao do medico vira linha de contrato
INSERT INTO "DoctorServiceRate" ("id", "rate", "doctorId", "serviceItemId")
SELECT gen_random_uuid()::text, d."hourlyRate", d."id", si."id"
FROM "Doctor" d
JOIN "ServiceItem" si ON si."companyId" = d."companyId" AND si."name" = 'Plantão (hora)'
WHERE d."hourlyRate" IS NOT NULL
ON CONFLICT ("doctorId", "serviceItemId") DO NOTHING;

-- 6. Consultas lancadas viram linha do lancamento
INSERT INTO "DoctorPeriodLine" ("id", "quantity", "rate", "reportId", "serviceItemId")
SELECT gen_random_uuid()::text, r."consultationCount", r."consultationRate", r."id", si."id"
FROM "DoctorPeriodReport" r
JOIN "ServiceItem" si ON si."companyId" = r."companyId" AND si."name" = 'Consulta'
WHERE r."consultationCount" IS NOT NULL AND r."consultationCount" > 0 AND r."consultationRate" IS NOT NULL
ON CONFLICT ("reportId", "serviceItemId") DO NOTHING;

-- 7. Horas de plantao lancadas viram linha do lancamento
INSERT INTO "DoctorPeriodLine" ("id", "quantity", "rate", "reportId", "serviceItemId")
SELECT gen_random_uuid()::text, r."hoursWorked", r."hourlyRate", r."id", si."id"
FROM "DoctorPeriodReport" r
JOIN "ServiceItem" si ON si."companyId" = r."companyId" AND si."name" = 'Plantão (hora)'
WHERE r."hoursWorked" IS NOT NULL AND r."hoursWorked" > 0 AND r."hourlyRate" IS NOT NULL
ON CONFLICT ("reportId", "serviceItemId") DO NOTHING;

-- 8. Agora os campos fixos podem sair
ALTER TABLE "Doctor" DROP COLUMN "paymentModel";
ALTER TABLE "Doctor" DROP COLUMN "consultationRate";
ALTER TABLE "Doctor" DROP COLUMN "hourlyRate";

ALTER TABLE "DoctorPeriodReport" DROP COLUMN "consultationCount";
ALTER TABLE "DoctorPeriodReport" DROP COLUMN "consultationRate";
ALTER TABLE "DoctorPeriodReport" DROP COLUMN "hoursWorked";
ALTER TABLE "DoctorPeriodReport" DROP COLUMN "hourlyRate";

DROP TYPE "DoctorPaymentModel";
