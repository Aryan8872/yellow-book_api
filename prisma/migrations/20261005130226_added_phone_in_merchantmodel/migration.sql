/*
  Warnings:

  - You are about to drop the column `category` on the `offers` table. All the data in the column will be lost.
  - Added the required column `phone` to the `merchant_branches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category_id` to the `offers` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "offers_category_idx";

-- AlterTable
ALTER TABLE "merchant_branches" ADD COLUMN     "phone" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "offers" DROP COLUMN "category",
ADD COLUMN     "category_id" TEXT NOT NULL,
ADD COLUMN     "discount_percentage" INTEGER,
ADD COLUMN     "discounted_price_npr" DECIMAL(10,2),
ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "original_price_npr" DECIMAL(10,2),
ADD COLUMN     "rating" DECIMAL(3,2) NOT NULL DEFAULT 4.8,
ADD COLUMN     "redemption_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviews_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trending_score" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon_url" TEXT,
    "image_url" TEXT,
    "color" TEXT DEFAULT '#6366f1',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "offer_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_idx" ON "categories"("is_active");

-- CreateIndex
CREATE INDEX "categories_display_order_idx" ON "categories"("display_order");

-- CreateIndex
CREATE INDEX "offers_category_id_idx" ON "offers"("category_id");

-- CreateIndex
CREATE INDEX "offers_trending_score_idx" ON "offers"("trending_score");

-- CreateIndex
CREATE INDEX "offers_redemption_count_idx" ON "offers"("redemption_count");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
