-- Database Optimization for Concurrent Entry Pass Access
-- Run this in your Supabase SQL Editor before the event

-- ============================================================================
-- CRITICAL: Add indexes for performance
-- ============================================================================

-- 1. Ensure row_hash is properly indexed in paidparticipants
-- If row_hash is not already the primary key, add an index
CREATE INDEX IF NOT EXISTS idx_paidparticipants_row_hash 
ON paidparticipants(row_hash);

-- Better yet, if row_hash should be unique, make it the primary key
-- (Comment out if you already have a different primary key)
-- ALTER TABLE paidparticipants ADD CONSTRAINT paidparticipants_pkey PRIMARY KEY (row_hash);

-- 2. Verify checkins table has primary key (should already exist)
-- This ensures atomic upserts during concurrent check-ins
-- ALTER TABLE checkins ADD CONSTRAINT checkins_pkey PRIMARY KEY (row_hash);

-- ============================================================================
-- Performance Monitoring Views
-- ============================================================================

-- View to check for slow queries or missing indexes
-- Run this after the event to see if there were any performance issues
CREATE OR REPLACE VIEW entry_pass_stats AS
SELECT 
  COUNT(*) as total_participants,
  (SELECT COUNT(*) FROM checkins) as total_checked_in,
  (SELECT COUNT(*) FROM checkins WHERE checked_in_at > NOW() - INTERVAL '1 hour') as checked_in_last_hour,
  (SELECT COUNT(*) FROM checkins WHERE checked_in_at > NOW() - INTERVAL '5 minutes') as checked_in_last_5min
FROM paidparticipants;

-- ============================================================================
-- Verify Index Creation
-- ============================================================================

-- Run this query to verify indexes exist
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('paidparticipants', 'checkins')
ORDER BY tablename, indexname;

-- ============================================================================
-- Performance Testing Query
-- ============================================================================

-- Test query performance (should complete in < 10ms with proper index)
EXPLAIN ANALYZE
SELECT row_number, headers, data
FROM paidparticipants
WHERE row_hash = 'test_hash_value';

-- If the above shows "Seq Scan" instead of "Index Scan", the index is missing!

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================

-- Ensure RLS policies are optimal for read performance
-- The entry_pass function uses service role key, so it bypasses RLS
-- But verify policies don't cause overhead:

-- Show current policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename IN ('paidparticipants', 'checkins')
ORDER BY tablename, policyname;

-- ============================================================================
-- Connection Pool Settings (Advanced)
-- ============================================================================

-- Check current connection settings
-- (These are managed by Supabase, but good to verify)
SHOW max_connections;
SHOW shared_buffers;

-- ============================================================================
-- Clean Up Test Data (Optional)
-- ============================================================================

-- If you have test data, remove it before the event
-- DELETE FROM checkins WHERE checked_in_by LIKE '%test%';
-- DELETE FROM paidparticipants WHERE row_hash LIKE '%test%';

-- ============================================================================
-- Post-Event Analysis Queries
-- ============================================================================

-- After the event, run these to analyze performance:

-- Check check-in patterns over time
-- SELECT 
--     DATE_TRUNC('minute', checked_in_at) as minute,
--     COUNT(*) as checkins_per_minute
-- FROM checkins
-- GROUP BY minute
-- ORDER BY minute;

-- Find peak concurrency
-- SELECT 
--     MAX(concurrent) as max_concurrent_checkins
-- FROM (
--     SELECT 
--         checked_in_at,
--         COUNT(*) OVER (
--             ORDER BY checked_in_at 
--             RANGE BETWEEN INTERVAL '1 second' PRECEDING AND CURRENT ROW
--         ) as concurrent
--     FROM checkins
-- ) subquery;

