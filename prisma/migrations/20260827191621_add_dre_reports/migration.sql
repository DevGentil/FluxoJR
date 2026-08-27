-- CreateTable
CREATE TABLE "DreReport" (
    "id" TEXT NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "notes" TEXT,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "DreReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DreReport_companyId_idx" ON "DreReport"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DreReport_companyId_competencia_key" ON "DreReport"("companyId", "competencia");

-- AddForeignKey
ALTER TABLE "DreReport" ADD CONSTRAINT "DreReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
