# 📋 Apply Free Entry Tracking Migration

## Quick Steps (30 seconds):

1. **Open Supabase Dashboard SQL Editor:**

   - Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

2. **Copy and paste this SQL:**

```sql
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
```

3. **Click "Run" button** ▶️

4. **Done!** ✅

The migration is safe to run multiple times (IF NOT EXISTS prevents errors).

---

## What This Does:

✅ Adds `entry_type` column (default 'paid') to track entry types  
✅ Sets all existing entries to 'paid' for backward compatibility  
✅ Adds database index for performance  
✅ Your frontend code is updated to include the "Free Entry" button  
✅ Free entries (staff/guests) will be marked with a blue badge

---

## New Functionality:

### In Latest Imported Table:

- **Mark Paid** button - for regular paid participants
- **Free Entry** button - for staff/guests (no payment needed)

Both buttons add the participant to the Paid Participants list where you can send WEB チケット.

### In Paid Participants List:

- Free entries show a blue **無料 (Free)** badge
- Paid entries show no badge (default)

---

## Safety Notes:

✅ All existing functionality preserved  
✅ Existing "Mark Paid" entries automatically set to 'paid'  
✅ No breaking changes to database queries  
✅ Web ticket sending works for both paid and free entries  
✅ Can easily filter/report by entry type

Once you run this SQL, the free entry tracking will be immediately active!
