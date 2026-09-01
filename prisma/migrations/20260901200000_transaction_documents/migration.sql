-- Documento passa a poder pertencer tambem a uma transacao ou a uma conta
-- a pagar/receber: a nota fiscal e o comprovante de pagamento. Segue o
-- mesmo desenho do vinculo com medico — coluna opcional, e nulo continua
-- significando documento solto da empresa.
--
-- ON DELETE CASCADE: comprovante sem o lancamento a que se refere nao tem
-- leitura possivel, e ficaria ocupando espaco para sempre sem ninguem
-- saber de onde veio.
ALTER TABLE "Document" ADD COLUMN "transactionId" TEXT;
ALTER TABLE "Document" ADD COLUMN "scheduledEntryId" TEXT;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_scheduledEntryId_fkey"
  FOREIGN KEY ("scheduledEntryId") REFERENCES "ScheduledEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Document_transactionId_idx" ON "Document"("transactionId");
CREATE INDEX "Document_scheduledEntryId_idx" ON "Document"("scheduledEntryId");
