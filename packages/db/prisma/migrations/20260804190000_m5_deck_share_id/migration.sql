-- Add the share handle nullable first so we can backfill existing rows.
ALTER TABLE "decks" ADD COLUMN "share_id" TEXT;

-- Backfill existing decks with a unique opaque id (uuid hex, no dashes).
UPDATE "decks" SET "share_id" = replace(gen_random_uuid()::text, '-', '') WHERE "share_id" IS NULL;

-- Enforce NOT NULL + uniqueness now that every row has a value.
ALTER TABLE "decks" ALTER COLUMN "share_id" SET NOT NULL;
CREATE UNIQUE INDEX "decks_share_id_key" ON "decks"("share_id");
