# Pre-Event Checklist for Entry Pass System

Use this checklist to ensure your system is ready for 500+ concurrent users.

## 🔴 Critical - Must Complete (2-3 days before event)

### Database Optimization

- [ ] Run `database_optimization.sql` in Supabase SQL Editor
- [ ] Verify index created on `paidparticipants.row_hash`
  ```sql
  -- Run this query to verify:
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'paidparticipants'
  AND indexdef LIKE '%row_hash%';
  ```
- [ ] Expected result: Should show an index on `row_hash`

### Load Testing

- [ ] Generate a valid test token:
  1. Go to your admin panel
  2. Select a test participant
  3. Generate entry pass
  4. Copy the token from the URL (the part after `/pass/`)
- [ ] Run load test with 100 users:
  ```bash
  node load-test.js 100 https://YOUR-PROJECT.supabase.co YOUR-ANON-KEY YOUR-TEST-TOKEN
  ```
- [ ] Verify results:

  - [ ] Success rate > 99%
  - [ ] Average response time < 1000ms
  - [ ] 95th percentile < 2000ms
  - [ ] No timeout errors

- [ ] Run load test with 500 users:
  ```bash
  node load-test.js 500 https://YOUR-PROJECT.supabase.co YOUR-ANON-KEY YOUR-TEST-TOKEN
  ```
- [ ] Verify results:
  - [ ] Success rate > 95%
  - [ ] Average response time < 2000ms
  - [ ] 95th percentile < 5000ms
  - [ ] Timeout rate < 5%

### Code Deployment

- [ ] Pull latest changes with retry logic and increased timeout
- [ ] Build and deploy the frontend:
  ```bash
  npm run build
  # Deploy to your hosting (Vercel, Netlify, etc.)
  ```
- [ ] Verify deployed app works by testing an entry pass URL

## 🟡 Important - Strongly Recommended (1 day before event)

### Monitoring Setup

- [ ] Open Supabase Dashboard
- [ ] Navigate to Database → Reports → Performance
- [ ] Keep this tab open during the event

- [ ] Open Edge Functions → Logs
- [ ] Keep this tab open during the event

### Test End-to-End Flow

- [ ] Send entry pass to test email address
- [ ] Open entry pass link on mobile device
- [ ] Verify page loads within 3 seconds
- [ ] Test check-in with correct PIN
- [ ] Verify check-in appears in admin panel

### Prepare for Issues

- [ ] Document Edge Function URLs
- [ ] Document admin credentials
- [ ] Save this checklist offline (in case of network issues)
- [ ] Assign team members to monitor:
  - [ ] Person 1: Monitors Supabase Dashboard
  - [ ] Person 2: Handles user issues at entrance
  - [ ] Person 3: Can fix technical issues if needed

## 🟢 Nice to Have (Day of event)

### Pre-Event Warmup (30 minutes before doors open)

- [ ] Run warmup script:
  ```bash
  node warmup-functions.js https://YOUR-PROJECT.supabase.co YOUR-ANON-KEY
  ```
- [ ] Keep script running in the background
- [ ] Verify "✅ Warmed" messages appear

### Performance Monitoring

- [ ] Open Supabase Dashboard → Database
- [ ] Check current active connections (should be < 50% of limit)
- [ ] Check database CPU usage (should be < 30%)

### Communication Plan

- [ ] Have admin panel open and ready
- [ ] Have manual check-in backup (paper list) ready
- [ ] Brief staff on what to do if system is slow:
  - Ask users to wait 30 seconds before trying again
  - Use manual check-in if necessary
  - Contact technical team immediately

## 🚀 During Event

### First 30 Minutes (Critical Period)

- [ ] Monitor Supabase Dashboard actively
- [ ] Watch for error rate spikes
- [ ] Check response times in real-time
- [ ] If issues occur:
  1. Check error messages in Edge Function logs
  2. Verify database connections are not maxed out
  3. Consider manual check-in as temporary fallback

### Success Metrics

- [ ] Entry pass resolution success rate > 98%
- [ ] Average load time < 3 seconds
- [ ] No critical errors in logs
- [ ] Users successfully checking in

## 🔍 Post-Event Analysis

### After Event (Next Day)

- [ ] Run performance analysis queries from `database_optimization.sql`
- [ ] Check peak concurrent users:
  ```sql
  SELECT
      MAX(concurrent) as max_concurrent_checkins
  FROM (
      SELECT
          checked_in_at,
          COUNT(*) OVER (
              ORDER BY checked_in_at
              RANGE BETWEEN INTERVAL '1 second' PRECEDING AND CURRENT ROW
          ) as concurrent
      FROM checkins
  ) subquery;
  ```
- [ ] Document any issues encountered
- [ ] Update this checklist based on learnings

## 📞 Emergency Contacts

| Role              | Name       | Contact    |
| ----------------- | ---------- | ---------- |
| Technical Lead    | ****\_**** | ****\_**** |
| Database Admin    | ****\_**** | ****\_**** |
| Event Coordinator | ****\_**** | ****\_**** |

## 🛠️ Emergency Procedures

### If System is Slow

1. Check Supabase Dashboard for database load
2. Run warmup script to wake up Edge Functions
3. Increase timeout in browser if users report issues
4. Consider temporary manual check-in

### If System is Down

1. Check Supabase status page: status.supabase.com
2. Verify Edge Functions are deployed
3. Check environment variables are set
4. Switch to manual check-in immediately
5. Log all manual check-ins for later data entry

### If High Error Rate

1. Check Edge Function logs for error messages
2. Look for rate limiting errors (HTTP 429)
3. Check database connection errors
4. Verify ENTRY_ADMIN_PIN hasn't changed
5. Consider increasing rate limits temporarily

## ✅ Sign-Off

- [ ] Technical Lead reviewed and approved: ****\_**** Date: ****\_****
- [ ] Database optimizations verified: ****\_**** Date: ****\_****
- [ ] Load testing passed: ****\_**** Date: ****\_****
- [ ] Team briefed on procedures: ****\_**** Date: ****\_****

---

**Good luck with your event! 🎉**

If you've completed all critical items, your system should handle 500+ concurrent users smoothly.
