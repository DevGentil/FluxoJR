-- Quem aprovou vira nome COPIADO, sem chave estrangeira — mesmo desenho de
-- PeriodClosing e do log de auditoria.
--
-- Duas razoes. A de registro: aprovacao que perde o responsavel quando a
-- conta e removida deixa de responder "quem autorizou". A pratica: a FK
-- quebrava a aprovacao sempre que a conta ativa nao existia na tabela —
-- fora de producao, por exemplo.
ALTER TABLE "CashClosing" DROP CONSTRAINT IF EXISTS "CashClosing_approvedById_fkey";
ALTER TABLE "CashClosing" ADD COLUMN "approvedByName" TEXT;
