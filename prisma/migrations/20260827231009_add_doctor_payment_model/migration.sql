-- CreateEnum
CREATE TYPE "DoctorPaymentModel" AS ENUM ('CONSULTATION', 'CONSULTATION_AND_EXAM', 'HOURLY');

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "hourlyRate" DECIMAL(14,2),
ADD COLUMN     "paymentModel" "DoctorPaymentModel" NOT NULL DEFAULT 'CONSULTATION_AND_EXAM',
ALTER COLUMN "consultationRate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DoctorPeriodReport" ADD COLUMN     "hourlyRate" DECIMAL(14,2),
ADD COLUMN     "hoursWorked" DECIMAL(8,2),
ALTER COLUMN "consultationCount" DROP NOT NULL,
ALTER COLUMN "consultationRate" DROP NOT NULL;
