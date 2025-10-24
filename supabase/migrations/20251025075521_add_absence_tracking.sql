-- Add absence tracking columns to checkins table
-- This allows tracking of family members who checked in but cannot attend

ALTER TABLE checkins 
ADD COLUMN IF NOT EXISTS absent_adults integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS absent_children integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS absent_infants integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS absence_note text DEFAULT '';

-- Add check constraints to ensure absence counts are not negative
ALTER TABLE checkins 
ADD CONSTRAINT check_absent_adults_non_negative CHECK (absent_adults >= 0),
ADD CONSTRAINT check_absent_children_non_negative CHECK (absent_children >= 0),
ADD CONSTRAINT check_absent_infants_non_negative CHECK (absent_infants >= 0);

-- Create index for queries that filter by absence
CREATE INDEX IF NOT EXISTS idx_checkins_with_absences 
ON checkins(row_hash) 
WHERE (absent_adults > 0 OR absent_children > 0 OR absent_infants > 0);

-- Comment the columns for documentation
COMMENT ON COLUMN checkins.absent_adults IS 'Number of adults who checked in but are absent (e.g., due to illness)';
COMMENT ON COLUMN checkins.absent_children IS 'Number of children who checked in but are absent (e.g., due to illness)';
COMMENT ON COLUMN checkins.absent_infants IS 'Number of infants who checked in but are absent (e.g., due to illness)';
COMMENT ON COLUMN checkins.absence_note IS 'Optional note explaining the absence reason (e.g., 体調不良)';

