-- O fechamento passa a ter aprovacao: so depois que o financeiro confere
-- e que ele vira dinheiro no razao.
CREATE TYPE "CashClosingStatus" AS ENUM ('PENDENTE', 'APROVADO');

ALTER TABLE "CashClosing" ADD COLUMN "status" "CashClosingStatus" NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE "CashClosing" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "CashClosing" ADD COLUMN "approvedById" TEXT;

ALTER TABLE "CashClosing"
  ADD CONSTRAINT "CashClosing_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O vinculo com a transacao inverte de lado. Antes o fechamento apontava
-- para UMA transacao; agora ele gera DUAS (a receita das sangrias e a
-- despesa dos pagamentos), entao quem aponta e a transacao.
ALTER TABLE "Transaction" ADD COLUMN "cashClosingId" TEXT;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_cashClosingId_fkey"
  FOREIGN KEY ("cashClosingId") REFERENCES "CashClosing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Transaction_cashClosingId_idx" ON "Transaction"("cashClosingId");

-- Traz o vinculo que ja existia para o lado novo, e marca como aprovado o
-- que ja estava no razao: esses fechamentos ja alimentavam o sistema, e
-- nasce-los como PENDENTE apagaria dinheiro que ja estava contabilizado.
UPDATE "Transaction" t SET "cashClosingId" = c.id
FROM "CashClosing" c WHERE c."transactionId" = t.id;

UPDATE "CashClosing" SET "status" = 'APROVADO', "approvedAt" = "createdAt"
WHERE "transactionId" IS NOT NULL;

ALTER TABLE "CashClosing" DROP CONSTRAINT IF EXISTS "CashClosing_transactionId_fkey";
DROP INDEX IF EXISTS "CashClosing_transactionId_key";
ALTER TABLE "CashClosing" DROP COLUMN "transactionId";
