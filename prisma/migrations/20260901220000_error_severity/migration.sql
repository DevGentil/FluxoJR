-- Gravidade do erro, para separar "o sistema esta fora" de "uma operacao
-- falhou" e de "funcionou como devia". Sem isso a lista trata igual a
-- queda do banco e a sessao vencida de alguem.
CREATE TYPE "ErrorSeverity" AS ENUM ('CRITICO', 'ERRO', 'AVISO');

ALTER TABLE "ErrorLog" ADD COLUMN "severity" "ErrorSeverity" NOT NULL DEFAULT 'ERRO';

-- Os registros que ja existem tambem sao classificados: deixar todos como
-- ERRO faria o filtro nascer mentindo sobre o historico. As regras abaixo
-- espelham `lib/erro-gravidade.ts` para os casos que de fato ocorrem —
-- dai em diante quem classifica e a aplicacao, na hora de gravar.
UPDATE "ErrorLog" SET "severity" = 'CRITICO'
WHERE "message" ~ 'does not exist in the current database'
   OR "message" ~ 'Unknown field .* for (include|select) statement'
   OR "message" ~ 'Can''t reach database server'
   OR "message" ~ 'P1000|P1001|P1002|P1008|P1017|P2021|P2022'
   OR coalesce("stack", '') ~ 'P1000|P1001|P1002|P1008|P1017|P2021|P2022';

UPDATE "ErrorLog" SET "severity" = 'AVISO'
WHERE "severity" = 'ERRO'
  AND ("message" ~* 'Sessao expirada|Sessão expirada|Faca login novamente|Faça login novamente|Nao autorizado|Não autorizado|Somente a holding|sem permissao|sem permissão'
    OR "message" ~ 'NEXT_REDIRECT|NEXT_NOT_FOUND|aborted');

CREATE INDEX "ErrorLog_severity_idx" ON "ErrorLog"("severity");
