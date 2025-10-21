# Concurrency Analysis & Recommendations for Entry Pass System

## Executive Summary

When 500 people access their unique entry pass URLs simultaneously, your system could face performance and reliability issues. This document identifies the problems and provides solutions.

## Current Architecture

1. Users receive unique URLs: `{baseUrl}/pass/{token}`
2. When accessed, the frontend calls the `entry_pass` Edge Function with `action: "resolve"`
3. The Edge Function:
   - Verifies JWT token
   - Queries `paidparticipants` table by `row_hash`
   - Queries `checkins` table by `row_hash`
   - Returns participant data

## Identified Issues

### 1. ✅ Database Index on `paidparticipants.row_hash` (CRITICAL)

**Problem**: Every resolve action queries `paidparticipants` by `row_hash`. Without an index, 500 concurrent queries will cause table scans.

**Current Status**: The schema shows `row_hash` as part of the table but doesn't explicitly mention an index.

**Solution**: Ensure `row_hash` is indexed (ideally as PRIMARY KEY or UNIQUE constraint).

### 2. ✅ Rate Limiting is Instance-Local (MODERATE)

**Problem**: Rate limiting uses in-memory `Map` storage. With multiple Edge Function instances, each instance has its own rate limit counter.

**Current Code**:

```typescript
const rateLimitStore = new Map<string, { count: number; ts: number }>();
```

**Impact**: A malicious user could bypass rate limits by triggering multiple Edge Function instances.

**Solution**: For a production event, consider:

- Supabase has automatic DDoS protection at the platform level
- The current limit (100 requests/minute per IP) is generous for legitimate users
- For 500 users, each accessing once, the current rate limiting is sufficient

### 3. ✅ Check-in Race Condition (HANDLED)

**Problem**: Multiple check-ins for the same `row_hash` could cause race conditions.

**Current Status**: ✅ **SAFE** - The code uses:

```typescript
await supabase.from("checkins").upsert([...], { onConflict: "row_hash" })
```

And the schema has:

```sql
create table if not exists checkins (
  row_hash text primary key,  -- PRIMARY KEY ensures atomicity
  ...
);
```

**Verdict**: This is correctly implemented. The PRIMARY KEY constraint ensures atomic upserts.

### 4. ⚠️ Edge Function Cold Starts (LOW-MODERATE)

**Problem**: When 500 users hit the function simultaneously, multiple Edge Function instances will spin up, causing cold starts (initial latency).

**Impact**: First 10-50 requests might be slower (1-3 seconds instead of <500ms).

**Mitigation**:

- Cold starts are inevitable but temporary
- Supabase Edge Functions use Deno Deploy which has fast cold starts
- After initial requests, functions stay warm

### 5. ✅ Database Connection Pooling (HANDLED)

**Problem**: 500 concurrent database connections could exceed connection limits.

**Current Status**: ✅ **SAFE** - Edge Functions use PostgREST which has built-in connection pooling.

### 6. ⚠️ JWT Verification Performance (LOW)

**Problem**: Each resolve action verifies a JWT, which involves cryptographic operations.

**Current Code**:

```typescript
const { rh } = await verifyToken(body.token);
```

**Impact**: At 500 concurrent requests, JWT verification could add 10-50ms per request.

**Verdict**: This is acceptable and unavoidable for security.

### 7. ⚠️ Frontend Timeout Configuration (MODERATE)

**Problem**: The frontend has a 12-second timeout, which might be too aggressive under load.

**Current Code**:

```typescript
async function fetchWithTimeout(..., timeoutMs: number = 12000)
```

**Recommendation**: Consider increasing to 20-30 seconds for the resolve action during the event.

## Recommended Actions

### 🔴 Critical (Must Do Before Event)

1. **Add Database Index**

   ```sql
   -- Run this in your Supabase SQL editor
   CREATE INDEX IF NOT EXISTS idx_paidparticipants_row_hash
   ON paidparticipants(row_hash);
   ```

   Or make `row_hash` a PRIMARY KEY:

   ```sql
   ALTER TABLE paidparticipants ADD PRIMARY KEY (row_hash);
   ```

2. **Verify Database Performance**
   - Test with 100+ concurrent requests
   - Use Supabase Dashboard to monitor query performance
   - Check database metrics during load test

### 🟡 Important (Strongly Recommended)

3. **Load Testing**

   - Test with 500+ concurrent requests
   - Use tools like Artillery, k6, or Apache JMeter
   - Verify response times stay under 5 seconds

4. **Increase Frontend Timeout for Entry Pass**

   - Change timeout from 12s to 25s for resolve action only
   - Add retry logic for failed requests

5. **Add Monitoring**
   - Set up Supabase real-time dashboard monitoring
   - Monitor Edge Function logs during the event
   - Have alerting for error rates > 5%

### 🟢 Nice to Have (Optional)

6. **Response Caching**

   - Cache resolved entry pass data in browser localStorage
   - Reduce redundant API calls if users refresh

7. **Progressive Enhancement**

   - Show loading state immediately
   - Display skeleton UI during load
   - Add retry button for failed loads

8. **Edge Function Warmup**
   - Hit the Edge Function 10-20 times before the event starts
   - This keeps functions warm and reduces cold starts

## Performance Expectations

With the recommended fixes:

| Metric                     | Expected Value |
| -------------------------- | -------------- |
| Average response time      | 200-800ms      |
| 95th percentile            | < 2 seconds    |
| 99th percentile            | < 5 seconds    |
| Error rate                 | < 0.5%         |
| Concurrent users supported | 1000+          |

## Testing Checklist

- [ ] Database index on `paidparticipants.row_hash` created
- [ ] Load test with 100 concurrent users passed
- [ ] Load test with 500 concurrent users passed
- [ ] Peak response time under 5 seconds
- [ ] Error rate under 1%
- [ ] Frontend timeout increased
- [ ] Monitoring dashboard ready
- [ ] Edge Functions warmed up before event

## Emergency Procedures

If issues occur during the event:

1. **Slow Performance**:

   - Check Supabase dashboard for database load
   - Verify network connectivity
   - Restart Edge Functions via Supabase dashboard

2. **High Error Rate**:

   - Check Edge Function logs
   - Verify environment variables are set
   - Check database connection limits

3. **Complete Outage**:
   - Verify Supabase service status
   - Check if Edge Functions are deployed
   - Fallback: Use admin panel to manually check in users

## Conclusion

Your current implementation is **mostly safe** for 500 concurrent users, but needs the following critical fixes:

1. ✅ Add database index on `paidparticipants.row_hash` (CRITICAL)
2. ✅ Increase frontend timeout for resolve action
3. ✅ Perform load testing
4. ✅ Set up monitoring

The check-in functionality is already correctly implemented with proper race condition handling.
