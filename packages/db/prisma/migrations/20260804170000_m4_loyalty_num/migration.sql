-- AlterTable
ALTER TABLE "oracle_cards" ADD COLUMN "loyalty_num" DOUBLE PRECISION;

-- Backfill numeric loyalty from the existing string column (no re-import needed).
UPDATE "oracle_cards"
SET "loyalty_num" = "loyalty"::double precision
WHERE "loyalty" ~ '^[0-9]+(\.[0-9]+)?$';

-- CreateIndex
CREATE INDEX "oracle_cards_loyalty_num_idx" ON "oracle_cards"("loyalty_num");
