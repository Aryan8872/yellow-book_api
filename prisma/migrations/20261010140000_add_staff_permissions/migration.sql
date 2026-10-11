-- AlterTable
ALTER TABLE "merchant_staff" ADD COLUMN     "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
