/*
  Warnings:

  - You are about to drop the column `image_url` on the `offers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "offers" DROP COLUMN "image_url",
ADD COLUMN     "cover_image" TEXT;
