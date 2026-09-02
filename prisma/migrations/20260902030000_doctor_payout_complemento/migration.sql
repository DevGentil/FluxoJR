-- Um medico pode ter mais de um repasse aprovado no mesmo mes.
--
-- O caso e real: um dia esquecido aparece depois da aprovacao e vira
-- pagamento complementar. Com o indice unico, a segunda aprovacao falhava
-- e a alternativa seria reabrir o mes inteiro para acrescentar um dia.
--
-- Duas linhas no razao nao e ruido: sao duas autorizacoes, em momentos
-- diferentes, e cada uma com seu proprio registro de quem aprovou.
DROP INDEX IF EXISTS "DoctorPayout_companyId_doctorId_month_key";
CREATE INDEX "DoctorPayout_companyId_doctorId_month_idx"
  ON "DoctorPayout"("companyId", "doctorId", "month");
