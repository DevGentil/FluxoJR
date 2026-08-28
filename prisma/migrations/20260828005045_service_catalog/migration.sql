-- Catalogo de servicos (Fase 1)
--
-- O antigo "ExamType" era so um rotulo de exame. As planilhas reais de
-- repasse mostram que o catalogo precisa cobrir TUDO que pode ser cobrado
-- do paciente e/ou repassado ao medico: consulta (CT/particular), exame,
-- procedimento, plantao e auxilio. Por isso ele vira "ServiceItem" e ganha
-- a economia do item (preco cobrado e custo de insumo).
--
-- Feito com RENAME em vez de DROP/CREATE para preservar os itens, as taxas
-- por medico e os lancamentos ja existentes.

-- 1. Renomeia tabelas
ALTER TABLE "ExamType" RENAME TO "ServiceItem";
ALTER TABLE "DoctorExamRate" RENAME TO "DoctorServiceRate";

-- 2. Renomeia colunas de FK
ALTER TABLE "DoctorServiceRate" RENAME COLUMN "examTypeId" TO "serviceItemId";
ALTER TABLE "DoctorPeriodExamCount" RENAME COLUMN "examTypeId" TO "serviceItemId";

-- 3. Renomeia constraints e indices para os nomes que o Prisma espera
ALTER TABLE "ServiceItem" RENAME CONSTRAINT "ExamType_pkey" TO "ServiceItem_pkey";
ALTER TABLE "ServiceItem" RENAME CONSTRAINT "ExamType_companyId_fkey" TO "ServiceItem_companyId_fkey";
ALTER INDEX "ExamType_companyId_name_key" RENAME TO "ServiceItem_companyId_name_key";

ALTER TABLE "DoctorServiceRate" RENAME CONSTRAINT "DoctorExamRate_pkey" TO "DoctorServiceRate_pkey";
ALTER TABLE "DoctorServiceRate" RENAME CONSTRAINT "DoctorExamRate_doctorId_fkey" TO "DoctorServiceRate_doctorId_fkey";
ALTER TABLE "DoctorServiceRate" RENAME CONSTRAINT "DoctorExamRate_examTypeId_fkey" TO "DoctorServiceRate_serviceItemId_fkey";
ALTER INDEX "DoctorExamRate_doctorId_examTypeId_key" RENAME TO "DoctorServiceRate_doctorId_serviceItemId_key";

ALTER TABLE "DoctorPeriodExamCount" RENAME CONSTRAINT "DoctorPeriodExamCount_examTypeId_fkey" TO "DoctorPeriodExamCount_serviceItemId_fkey";
ALTER INDEX "DoctorPeriodExamCount_reportId_examTypeId_key" RENAME TO "DoctorPeriodExamCount_reportId_serviceItemId_key";

-- 4. Enums novos
CREATE TYPE "ServiceCategory" AS ENUM ('CONSULTA', 'EXAME', 'PROCEDIMENTO', 'PLANTAO', 'OUTRO');
CREATE TYPE "Payer" AS ENUM ('CT', 'PARTICULAR');

-- 5. Economia do item no catalogo. Os itens que ja existiam sao exames, por
-- isso o default EXAME; preco fica nulo ate ser informado.
ALTER TABLE "ServiceItem" ADD COLUMN "group" TEXT;
ALTER TABLE "ServiceItem" ADD COLUMN "category" "ServiceCategory" NOT NULL DEFAULT 'EXAME';
ALTER TABLE "ServiceItem" ADD COLUMN "payer" "Payer";
ALTER TABLE "ServiceItem" ADD COLUMN "price" DECIMAL(14,2);
ALTER TABLE "ServiceItem" ADD COLUMN "operationalCost" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ServiceItem" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ServiceItem" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ServiceItem" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 6. Faixas de taxa da maquininha, por empresa
CREATE TABLE "TaxBracket" (
    "id" TEXT NOT NULL,
    "minValue" DECIMAL(14,2) NOT NULL,
    "maxValue" DECIMAL(14,2),
    "percent" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "TaxBracket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaxBracket_companyId_idx" ON "TaxBracket"("companyId");

ALTER TABLE "TaxBracket" ADD CONSTRAINT "TaxBracket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
