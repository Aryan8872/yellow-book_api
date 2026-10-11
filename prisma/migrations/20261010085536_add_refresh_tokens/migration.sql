-- AlterTable
ALTER TABLE "users" ADD COLUMN     "refresh_token" TEXT,
ADD COLUMN     "refresh_token_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_refresh_token_idx" ON "users"("refresh_token");
