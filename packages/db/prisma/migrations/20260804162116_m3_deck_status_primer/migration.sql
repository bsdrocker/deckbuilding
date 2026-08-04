-- CreateEnum
CREATE TYPE "DeckStatus" AS ENUM ('brewing', 'built');

-- AlterTable
ALTER TABLE "decks" ADD COLUMN     "primer" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "DeckStatus" NOT NULL DEFAULT 'brewing';

-- CreateIndex
CREATE INDEX "decks_user_id_status_idx" ON "decks"("user_id", "status");
