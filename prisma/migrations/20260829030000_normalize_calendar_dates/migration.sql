-- Datas de calendario (competencia, vencimento, dia do atendimento, data da
-- transacao) passam a ser sempre a meia-noite UTC -- ver lib/date-only.ts.
--
-- O que estava gravado tinha hora: 17:33 nas linhas vindas do seed e 03:00
-- nos repasses diarios (meia-noite no horario de Brasilia). Truncar para o
-- dia NAO muda o dia de calendario de nenhuma linha, porque todas as
-- comparacoes e exibicoes do sistema ja sao feitas em UTC.
--
-- Sem isso, a chave unica (companyId, date) do fechamento de caixa deixaria
-- de casar com as linhas antigas: a busca por duplicata procura a meia-noite
-- exata e nao acharia um fechamento gravado as 17:33, permitindo cadastrar
-- dois fechamentos para o mesmo dia.

UPDATE "Transaction"      SET "date"      = date_trunc('day', "date")      WHERE "date"::time      <> '00:00:00';
UPDATE "ScheduledEntry"   SET "dueDate"   = date_trunc('day', "dueDate")   WHERE "dueDate"::time   <> '00:00:00';
UPDATE "ScheduledEntry"   SET "paidDate"  = date_trunc('day', "paidDate")  WHERE "paidDate" IS NOT NULL AND "paidDate"::time <> '00:00:00';
UPDATE "CashClosing"      SET "date"      = date_trunc('day', "date")      WHERE "date"::time      <> '00:00:00';
UPDATE "DreReport"        SET "competencia" = date_trunc('day', "competencia") WHERE "competencia"::time <> '00:00:00';
UPDATE "DoctorDailyEntry" SET "date"      = date_trunc('day', "date")      WHERE "date"::time      <> '00:00:00';
