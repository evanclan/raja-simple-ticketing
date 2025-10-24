-- Add click_count column to paidparticipants table
-- This tracks how many times a participant has clicked their entry pass link
ALTER TABLE paidparticipants 
ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_paidparticipants_click_count 
ON paidparticipants(click_count);

-- Add comment explaining the column
COMMENT ON COLUMN paidparticipants.click_count IS 'Number of times the participant has accessed their entry pass link';

