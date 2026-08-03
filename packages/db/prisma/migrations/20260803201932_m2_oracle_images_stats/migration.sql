-- AlterTable
ALTER TABLE "oracle_cards" ADD COLUMN     "image_uris" JSONB,
ADD COLUMN     "loyalty" TEXT,
ADD COLUMN     "power" TEXT,
ADD COLUMN     "power_num" DOUBLE PRECISION,
ADD COLUMN     "toughness" TEXT,
ADD COLUMN     "toughness_num" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "oracle_cards_power_num_idx" ON "oracle_cards"("power_num");

-- CreateIndex
CREATE INDEX "oracle_cards_toughness_num_idx" ON "oracle_cards"("toughness_num");
