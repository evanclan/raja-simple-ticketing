-- Add entry_type column to paidparticipants table
-- This tracks whether an entry is paid or free (staff/guest)
ALTER TABLE paidparticipants 
ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'paid';

-- Set all existing entries to 'paid' for backward compatibility
UPDATE paidparticipants 
SET entry_type = 'paid' 
WHERE entry_type IS NULL;

-- Add index for filtering/reporting
CREATE INDEX IF NOT EXISTS idx_paidparticipants_entry_type 
ON paidparticipants(entry_type);

-- Add comment explaining the column
COMMENT ON COLUMN paidparticipants.entry_type IS 'Entry type: "paid" for paid entries, "free" for staff/guest entries';

