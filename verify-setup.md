# 🔍 Verification Guide - Is Everything Ready?

Run through these checks to confirm your system is ready for 500+ concurrent users.

---

## ✅ Step 1: Verify Database Index (CRITICAL)

### Run this SQL in Supabase:

```sql
-- Check if index exists
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'paidparticipants'
  AND (indexname LIKE '%row_hash%' OR indexname LIKE '%pkey%');
```

### ✅ Expected Result:

You should see **at least one** of these:

- `idx_paidparticipants_row_hash` (the index we just created)
- OR a primary key constraint on `row_hash`

### ❌ If you see NOTHING:

The index wasn't created. Run this again:

```sql
CREATE INDEX IF NOT EXISTS idx_paidparticipants_row_hash
ON paidparticipants(row_hash);
```

---

## ✅ Step 2: Check Table Structure

### Run this SQL:

```sql
-- Verify tables exist and have data
SELECT
    'paidparticipants' as table_name,
    COUNT(*) as row_count
FROM paidparticipants
UNION ALL
SELECT
    'checkins' as table_name,
    COUNT(*) as row_count
FROM checkins;
```

### ✅ Expected Result:

```
paidparticipants | <number of participants>
checkins         | <number of check-ins>
```

---

## ✅ Step 3: Get a Test Token

### Option A: From Admin Panel

1. Go to your deployed site
2. Login as admin
3. Go to participants list
4. Click "Send Entry Pass" on any participant
5. Copy the token from the generated URL

### Option B: Generate via SQL (if you have a participant)

```sql
-- Get a sample row_hash
SELECT row_hash
FROM paidparticipants
LIMIT 1;
```

Copy the `row_hash`, then use your Edge Function to generate a token.

---

## ✅ Step 4: Test Query Performance

### Run this SQL with a real row_hash:

```sql
-- Replace 'YOUR_ROW_HASH_HERE' with actual row_hash from your data
EXPLAIN ANALYZE
SELECT row_number, headers, data
FROM paidparticipants
WHERE row_hash = 'YOUR_ROW_HASH_HERE';
```

### ✅ What to Look For:

**GOOD** (with index):

```
Index Scan using idx_paidparticipants_row_hash
Execution Time: 0.123 ms
```

**BAD** (without index):

```
Seq Scan on paidparticipants
Execution Time: 45.678 ms
```

---

## ✅ Step 5: Verify Deployment

### Check your deployed site:

1. **Visit your production URL**
2. **Open browser DevTools** (F12)
3. **Go to Console tab**
4. **Check for any errors**

### Test an entry pass URL:

1. Generate or use an existing entry pass URL
2. Open it in a browser
3. Should load participant data
4. Check Network tab - request should complete in < 2 seconds

---

## ✅ Step 6: Run Load Test

### Get your values:

1. **Supabase URL**: `https://xxxxx.supabase.co`
   - Find in: Supabase Dashboard → Settings → API
2. **Anon Key**: `eyJhbG...`
   - Find in: Supabase Dashboard → Settings → API → anon/public key
3. **Test Token**: `eyJhbG...`
   - From Step 3 above

### Run the test:

```bash
# Start with 10 users to make sure it works
npm run load-test 10 YOUR-SUPABASE-URL YOUR-ANON-KEY YOUR-TEST-TOKEN

# If successful, try 100
npm run load-test 100 YOUR-SUPABASE-URL YOUR-ANON-KEY YOUR-TEST-TOKEN

# Finally, test with 500
npm run load-test 500 YOUR-SUPABASE-URL YOUR-ANON-KEY YOUR-TEST-TOKEN
```

### ✅ Success Criteria:

- **Success rate**: > 95% (ideally > 99%)
- **Average response time**: < 2 seconds
- **95th percentile**: < 5 seconds
- **No timeout errors**: < 1%

---

## 🎯 Quick Checklist

Copy and paste this to track your progress:

```
[ ] Database index verified (Step 1)
[ ] Tables have data (Step 2)
[ ] Test token obtained (Step 3)
[ ] Query performance is fast <5ms (Step 4)
[ ] Deployment is live (Step 5)
[ ] Load test with 10 users passed (Step 6)
[ ] Load test with 100 users passed (Step 6)
[ ] Load test with 500 users passed (Step 6)
```

---

## 🚨 Troubleshooting

### "Index Scan" not showing in EXPLAIN ANALYZE

**Problem**: Index isn't being used
**Fix**:

```sql
-- Rebuild statistics
ANALYZE paidparticipants;

-- Then verify again
EXPLAIN ANALYZE
SELECT * FROM paidparticipants WHERE row_hash = 'your_hash';
```

### Load test shows high failure rate

**Check**:

1. Is the test token valid? (should start with `eyJ`)
2. Is the Supabase URL correct?
3. Is the anon key correct?
4. Does the participant exist in the database?

### Load test times out

**Check**:

1. Is your internet connection stable?
2. Are Edge Functions deployed?
3. Run the warmup script first:
   ```bash
   npm run warmup YOUR-SUPABASE-URL YOUR-ANON-KEY
   ```

---

## 📊 What Good Results Look Like

### Database Query (Step 4):

```
Index Scan using idx_paidparticipants_row_hash on paidparticipants
  Index Cond: (row_hash = 'abc123...'::text)
Planning Time: 0.089 ms
Execution Time: 0.234 ms  ← Should be < 5ms
```

### Load Test (Step 6):

```
======================================================================
LOAD TEST RESULTS
======================================================================
Summary:
  Total Requests: 500
  Successful: 497 (99.40%)  ← Should be > 95%
  Failed: 3
  Duration: 4.23s
  Requests/sec: 118.20

Response Times:
  Min: 145ms
  Average: 523ms              ← Should be < 2s
  Median: 489ms
  95th percentile: 1234ms     ← Should be < 5s
  99th percentile: 1876ms
  Max: 2134ms

Assessment:
  ✅ EXCELLENT - System is ready for production
======================================================================
```

---

## 🎉 You're Ready When...

✅ Database index exists and is being used
✅ Test queries complete in < 5ms
✅ Load test shows > 95% success rate
✅ Response times are < 5 seconds at 95th percentile
✅ Deployment is live and accessible

---

**Having issues? Check `QUICK_REFERENCE.md` for troubleshooting!**
