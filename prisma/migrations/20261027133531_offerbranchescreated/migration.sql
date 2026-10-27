-- CreateTable
CREATE TABLE "_OfferBranches" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_OfferBranches_AB_unique" ON "_OfferBranches"("A", "B");

-- CreateIndex
CREATE INDEX "_OfferBranches_B_index" ON "_OfferBranches"("B");

-- AddForeignKey
ALTER TABLE "_OfferBranches" ADD CONSTRAINT "_OfferBranches_A_fkey" FOREIGN KEY ("A") REFERENCES "merchant_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OfferBranches" ADD CONSTRAINT "_OfferBranches_B_fkey" FOREIGN KEY ("B") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
