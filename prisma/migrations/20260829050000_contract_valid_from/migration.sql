-- Contrato do medico passa a ter vigencia: cada reajuste vira uma linha
-- nova em vez de sobrescrever a anterior. Ver lib/doctor-rates.ts.
--
-- As linhas que ja existem recebem como inicio de vigencia o dia em que o
-- medico foi cadastrado (truncado, em UTC como toda data de calendario do
-- sistema). E o mais antigo que se pode afirmar com honestidade: o sistema
-- nao sabe o que valia antes disso. A selecao temporal cai na versao mais
-- antiga conhecida quando a data pedida e anterior a tudo, entao lancar um
-- dia anterior ao cadastro continua funcionando.

ALTER TABLE "DoctorServiceRate" ADD COLUMN "validFrom" TIMESTAMP(3);

UPDATE "DoctorServiceRate" r
SET "validFrom" = date_trunc('day', d."createdAt")
FROM "Doctor" d
WHERE d."id" = r."doctorId";

-- Rede de seguranca: linha orfa de medico nao deveria existir (a FK e
-- cascade), mas sem isso o NOT NULL abaixo falharia.
UPDATE "DoctorServiceRate" SET "validFrom" = date_trunc('day', now()) WHERE "validFrom" IS NULL;

ALTER TABLE "DoctorServiceRate" ALTER COLUMN "validFrom" SET NOT NULL;

-- A unicidade passa a incluir a vigencia: o mesmo medico pode ter varios
-- valores para o mesmo item, um por data de inicio.
DROP INDEX "DoctorServiceRate_doctorId_serviceItemId_key";
CREATE UNIQUE INDEX "DoctorServiceRate_doctorId_serviceItemId_validFrom_key"
  ON "DoctorServiceRate"("doctorId", "serviceItemId", "validFrom");
CREATE INDEX "DoctorServiceRate_doctorId_serviceItemId_validFrom_idx"
  ON "DoctorServiceRate"("doctorId", "serviceItemId", "validFrom");
