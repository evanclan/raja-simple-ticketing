-- ============================================================================
-- Database Index Verification Script
-- Run this in Supabase SQL Editor to verify index is properly deployed
-- ============================================================================

-- 1. Check if the critical index exists
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes
WHERE tablename = 'paidparticipants' 
AND indexname = 'idx_paidparticipants_row_hash';

-- Expected result: You should see one row with indexname 'idx_paidparticipants_row_hash'
-- If empty result = index does NOT exist (need to create it)
-- If one row = index EXISTS ✅

-- ============================================================================

-- 2. Check ALL indexes on paidparticipants table
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'paidparticipants'
ORDER BY indexname;

-- This shows all indexes on the table for reference

-- ============================================================================

-- 3. Test query performance (EXPLAIN ANALYZE shows if index is being used)
EXPLAIN ANALYZE
SELECT row_number, headers, data, click_count
FROM paidparticipants
WHERE row_hash = 'test_value';

-- Look for "Index Scan using idx_paidparticipants_row_hash" in results
-- If you see "Seq Scan" instead = index is NOT being used
-- If you see "Index Scan" = index IS being used ✅

-- ============================================================================

-- 4. Check table statistics
SELECT 
    schemaname,
    tablename,
    n_live_tup as row_count,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename = 'paidparticipants';

-- Shows how many rows in table and when it was last analyzed

-- ============================================================================
-- EXPECTED RESULTS SUMMARY
-- ============================================================================
-- Query 1: Should show idx_paidparticipants_row_hash
-- Query 2: Should show at least one index
-- Query 3: Should show "Index Scan" (not "Seq Scan")
-- Query 4: Shows table stats for reference



