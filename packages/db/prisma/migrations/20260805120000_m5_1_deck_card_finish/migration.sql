-- Optional preferred finish for a deck card (nonfoil | foil | etched). Null =
-- no finish preference (any finish counts as owned).
ALTER TABLE "deck_cards" ADD COLUMN "finish" TEXT;
