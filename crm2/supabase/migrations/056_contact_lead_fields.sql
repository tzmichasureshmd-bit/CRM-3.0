-- 056_contact_lead_fields.sql
-- Add first-class business/lead fields to `contacts` for the upgraded
-- Contacts page: import, table columns, search, filtering, and export.
--
-- These are plain optional columns (NULL until populated). RLS is
-- unchanged — the existing per-account policies already govern every
-- column of `contacts`, so no policy changes are needed here.
--
-- Data types follow the CRM conventions:
--   rating      numeric   (e.g. 4.7)  -> supports numeric comparison
--   review_count integer   (e.g. 326) -> supports numeric comparison
--   the rest    text

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS country      TEXT,
  ADD COLUMN IF NOT EXISTS location     TEXT,
  ADD COLUMN IF NOT EXISTS category     TEXT,
  ADD COLUMN IF NOT EXISTS address      TEXT,
  ADD COLUMN IF NOT EXISTS website      TEXT,
  ADD COLUMN IF NOT EXISTS rating       NUMERIC,
  ADD COLUMN IF NOT EXISTS review_count INTEGER,
  ADD COLUMN IF NOT EXISTS imported_at  TIMESTAMPTZ;

-- Indexes for the frequently searched / filtered fields. GIN-free:
-- these are exact/ILIKE lookups, so plain b-tree (optionally with
-- text_pattern_ops) is the right shape. Only add what we actually query.
CREATE INDEX IF NOT EXISTS idx_contacts_country     ON contacts(country);
CREATE INDEX IF NOT EXISTS idx_contacts_location    ON contacts(location);
CREATE INDEX IF NOT EXISTS idx_contacts_category    ON contacts(category);
CREATE INDEX IF NOT EXISTS idx_contacts_rating      ON contacts(rating);
CREATE INDEX IF NOT EXISTS idx_contacts_review_count ON contacts(review_count);
CREATE INDEX IF NOT EXISTS idx_contacts_email       ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_imported_at ON contacts(imported_at);
