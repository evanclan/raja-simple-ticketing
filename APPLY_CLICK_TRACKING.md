# 📋 Apply Click Tracking Migration

## Quick Steps (30 seconds):

1. **Open Supabase Dashboard SQL Editor:**

   - Go to: https://supabase.com/dashboard/project/qhpnjpjotcehjabfdovp/sql/new

2. **Copy and paste this SQL:**

```sql
-- Add click_count column to paidparticipants table
-- This tracks how many times a participant has clicked their entry pass link
ALTER TABLE paidparticipants
ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_paidparticipants_click_count
ON paidparticipants(click_count);

-- Add comment explaining the column
COMMENT ON COLUMN paidparticipants.click_count IS 'Number of times the participant has accessed their entry pass link';
```

3. **Click "Run" button** ▶️

4. **Done!** ✅

The migration is safe to run multiple times (IF NOT EXISTS prevents errors).

---

## What This Does:

✅ Adds `click_count` column (default 0) to track link clicks  
✅ Adds database index for performance  
✅ Your frontend code is already updated to show the click counts  
✅ Your edge function is already updated to increment the counter

Once you run this SQL, the click tracking will be immediately active!
