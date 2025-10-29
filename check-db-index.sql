-- Check if the critical index exists
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('paidparticipants', 'checkins')
ORDER BY tablename, indexname;
