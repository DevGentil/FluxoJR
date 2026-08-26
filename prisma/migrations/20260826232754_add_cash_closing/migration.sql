-- CreateEnum
CREATE TYPE "CashClosingLineType" AS ENUM ('SANGRIA', 'PAGAMENTO');

-- CreateTable
CREATE TABLE "CashClosing" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "countedCash" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT,

    CONSTRAINT "CashClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashClosingLine" (
    "id" TEXT NOT NULL,
    "type" "CashClosingLineType" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "order" INTEGER NOT NULL,
    "cashClosingId" TEXT NOT NULL,

    CONSTRAINT "CashClosingLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashClosing_transactionId_key" ON "CashClosing"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosing_companyId_date_key" ON "CashClosing"("companyId", "date");

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosingLine" ADD CONSTRAINT "CashClosingLine_cashClosingId_fkey" FOREIGN KEY ("cashClosingId") REFERENCES "CashClosing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
