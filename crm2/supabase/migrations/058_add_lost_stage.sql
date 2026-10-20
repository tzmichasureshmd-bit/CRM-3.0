-- 058_add_lost_stage.sql
-- Add a "Lost" stage to every existing pipeline that doesn't already have
-- one (case-insensitive match on a trimmed name), so the pipeline ends in
-- "... Won, Lost". The new stage uses a red loss accent, matching the Won
-- card's design but with the loss color.
--
-- Newly-created pipelines pick up "Lost" automatically via the client-side
-- SPEC_DEFAULT_STAGES seed; this migration only backfills pipelines that
-- were seeded before the Lost stage existed.
--
-- Idempotent: each pipeline is guarded by a NOT EXISTS check, so repeated
-- runs never create duplicate Lost stages.

DO $$
DECLARE
  p RECORD;
  has_lost BOOLEAN;
  next_pos INTEGER;
BEGIN
  FOR p IN SELECT id FROM pipelines LOOP
    SELECT EXISTS (
      SELECT 1 FROM pipeline_stages
      WHERE pipeline_id = p.id AND LOWER(BTRIM(name)) = 'lost'
    ) INTO has_lost;

    IF NOT has_lost THEN
      -- Append at the end of the stage order so Lost always sorts after Won.
      SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos
      FROM pipeline_stages
      WHERE pipeline_id = p.id;

      INSERT INTO pipeline_stages (pipeline_id, name, position, color)
      VALUES (p.id, 'Lost', COALESCE(next_pos, 0), '#ef4444');
    END IF;
  END LOOP;
END $$;
