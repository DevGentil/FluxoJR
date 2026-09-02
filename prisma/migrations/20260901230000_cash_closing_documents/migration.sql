-- Documento passa a poder pertencer tambem a um fechamento de caixa: a
-- nota ou o recibo dos pagamentos em dinheiro do dia, que hoje ficam so
-- como linha com rotulo e valor.
--
-- Mesmo desenho dos outros vinculos: coluna opcional, CASCADE porque
-- comprovante sem o fechamento a que se refere nao tem leitura possivel.
ALTER TABLE "Document" ADD COLUMN "cashClosingId" TEXT;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_cashClosingId_fkey"
  FOREIGN KEY ("cashClosingId") REFERENCES "CashClosing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Document_cashClosingId_idx" ON "Document"("cashClosingId");
