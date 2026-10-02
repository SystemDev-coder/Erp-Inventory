-- Lets each category carry one of a curated set of icon keys (resolved to a
-- lucide-react icon client-side - see frontend/src/config/categoryIcons.ts).
-- Nullable: existing categories fall back to the same deterministic
-- index-rotation icon POSTab.tsx already used before this column existed.
ALTER TABLE ims.categories ADD COLUMN IF NOT EXISTS icon VARCHAR(40);
