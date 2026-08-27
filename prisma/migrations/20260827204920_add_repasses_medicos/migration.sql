-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "paymentMethod" TEXT,
    "consultationRate" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "ExamType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorExamRate" (
    "id" TEXT NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "doctorId" TEXT NOT NULL,
    "examTypeId" TEXT NOT NULL,

    CONSTRAINT "DoctorExamRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorPeriodReport" (
    "id" TEXT NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "consultationCount" INTEGER NOT NULL,
    "consultationRate" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "doctorId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "DoctorPeriodReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorPeriodExamCount" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "reportId" TEXT NOT NULL,
    "examTypeId" TEXT NOT NULL,

    CONSTRAINT "DoctorPeriodExamCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamType_companyId_name_key" ON "ExamType"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorExamRate_doctorId_examTypeId_key" ON "DoctorExamRate"("doctorId", "examTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorPeriodReport_doctorId_competencia_key" ON "DoctorPeriodReport"("doctorId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorPeriodExamCount_reportId_examTypeId_key" ON "DoctorPeriodExamCount"("reportId", "examTypeId");

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamType" ADD CONSTRAINT "ExamType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorExamRate" ADD CONSTRAINT "DoctorExamRate_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorExamRate" ADD CONSTRAINT "DoctorExamRate_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPeriodReport" ADD CONSTRAINT "DoctorPeriodReport_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPeriodReport" ADD CONSTRAINT "DoctorPeriodReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPeriodExamCount" ADD CONSTRAINT "DoctorPeriodExamCount_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DoctorPeriodReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPeriodExamCount" ADD CONSTRAINT "DoctorPeriodExamCount_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
