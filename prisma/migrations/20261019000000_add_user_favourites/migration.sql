-- CreateTable
CREATE TABLE "user_favourites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favourites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_favourites_user_id_idx" ON "user_favourites"("user_id");

-- CreateIndex
CREATE INDEX "user_favourites_offer_id_idx" ON "user_favourites"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_favourites_user_id_offer_id_key" ON "user_favourites"("user_id", "offer_id");

-- AddForeignKey
ALTER TABLE "user_favourites" ADD CONSTRAINT "user_favourites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favourites" ADD CONSTRAINT "user_favourites_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
