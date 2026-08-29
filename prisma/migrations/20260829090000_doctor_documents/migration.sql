-- Documento passa a poder pertencer a um medico, e nao so a empresa: o
-- contrato assinado, um aditivo, o diploma. Nulo continua sendo documento
-- da empresa, que e como todos os que ja existem nasceram.
ALTER TABLE "Document" ADD COLUMN "doctorId" TEXT;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Document_doctorId_idx" ON "Document"("doctorId");
