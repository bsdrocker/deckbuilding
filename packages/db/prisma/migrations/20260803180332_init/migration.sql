-- CreateEnum
CREATE TYPE "DeckFormat" AS ENUM ('commander', 'standard', 'modern', 'pioneer', 'pauper', 'legacy', 'vintage', 'brawl', 'historic', 'explorer', 'oathbreaker', 'premodern', 'penny', 'duel', 'oldschool', 'limited', 'casual');

-- CreateEnum
CREATE TYPE "DeckVisibility" AS ENUM ('private', 'unlisted', 'public');

-- CreateEnum
CREATE TYPE "DeckBoard" AS ENUM ('mainboard', 'sideboard', 'maybeboard', 'command');

-- CreateTable
CREATE TABLE "oracle_cards" (
    "oracle_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mana_cost" TEXT,
    "cmc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type_line" TEXT NOT NULL,
    "oracle_text" TEXT,
    "colors" TEXT[],
    "color_identity" TEXT[],
    "keywords" TEXT[],
    "produced_mana" TEXT[],
    "legalities" JSONB NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'normal',
    "reserved_list" BOOLEAN NOT NULL DEFAULT false,
    "edhrec_rank" INTEGER,
    "card_faces" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oracle_cards_pkey" PRIMARY KEY ("oracle_id")
);

-- CreateTable
CREATE TABLE "card_printings" (
    "scryfall_id" TEXT NOT NULL,
    "oracle_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "set_code" TEXT NOT NULL,
    "set_name" TEXT NOT NULL,
    "collector_number" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "finishes" TEXT[],
    "image_uris" JSONB,
    "prices" JSONB,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_printings_pkey" PRIMARY KEY ("scryfall_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashed_key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "DeckFormat" NOT NULL DEFAULT 'commander',
    "description" TEXT NOT NULL DEFAULT '',
    "visibility" "DeckVisibility" NOT NULL DEFAULT 'private',
    "color_identity" TEXT[],
    "commander_oracle_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_cards" (
    "id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "oracle_id" TEXT NOT NULL,
    "printing_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "board" "DeckBoard" NOT NULL DEFAULT 'mainboard',
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deck_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "printing_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "finish" TEXT NOT NULL DEFAULT 'nonfoil',
    "condition" TEXT NOT NULL DEFAULT 'NM',
    "language" TEXT NOT NULL DEFAULT 'en',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oracle_cards_name_idx" ON "oracle_cards"("name");

-- CreateIndex
CREATE INDEX "oracle_cards_cmc_idx" ON "oracle_cards"("cmc");

-- CreateIndex
CREATE INDEX "oracle_cards_edhrec_rank_idx" ON "oracle_cards"("edhrec_rank");

-- CreateIndex
CREATE INDEX "card_printings_oracle_id_idx" ON "card_printings"("oracle_id");

-- CreateIndex
CREATE INDEX "card_printings_set_code_idx" ON "card_printings"("set_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hashed_key_key" ON "api_keys"("hashed_key");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "decks_user_id_idx" ON "decks"("user_id");

-- CreateIndex
CREATE INDEX "deck_cards_deck_id_idx" ON "deck_cards"("deck_id");

-- CreateIndex
CREATE UNIQUE INDEX "deck_cards_deck_id_oracle_id_board_key" ON "deck_cards"("deck_id", "oracle_id", "board");

-- CreateIndex
CREATE INDEX "inventory_items_user_id_idx" ON "inventory_items"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_user_id_printing_id_finish_condition_langua_key" ON "inventory_items"("user_id", "printing_id", "finish", "condition", "language");

-- AddForeignKey
ALTER TABLE "card_printings" ADD CONSTRAINT "card_printings_oracle_id_fkey" FOREIGN KEY ("oracle_id") REFERENCES "oracle_cards"("oracle_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_oracle_id_fkey" FOREIGN KEY ("oracle_id") REFERENCES "oracle_cards"("oracle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_printing_id_fkey" FOREIGN KEY ("printing_id") REFERENCES "card_printings"("scryfall_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_printing_id_fkey" FOREIGN KEY ("printing_id") REFERENCES "card_printings"("scryfall_id") ON DELETE RESTRICT ON UPDATE CASCADE;
