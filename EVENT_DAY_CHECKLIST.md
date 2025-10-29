# 📋 Event Day Quick Reference Card

## ✅ Pre-Event Checklist (30 min before)

- [ ] **CRITICAL:** Verify database index exists (see below)
- [ ] Test one entry pass link on mobile device
- [ ] Open Supabase dashboard: https://supabase.com/dashboard/project/qhpnjpjotcehjabfdovp
- [ ] Have admin panel open and logged in
- [ ] Print backup participant list (just in case)
- [ ] Charge all devices (phone, tablet, laptop)
- [ ] Test internet connectivity at venue
- [ ] Warm up functions (access your production URL 10 times)

---

## 🔴 CRITICAL: Database Index Check

**DO THIS NOW if not done yet:**

1. Go to: https://supabase.com/dashboard/project/qhpnjpjotcehjabfdovp
2. Click "SQL Editor" in left sidebar
3. Copy and paste this:

```sql
-- Create the critical index
CREATE INDEX IF NOT EXISTS idx_paidparticipants_row_hash
ON paidparticipants(row_hash);

-- Verify it exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'paidparticipants'
AND indexname LIKE '%row_hash%';
```

4. Click "Run"
5. Verify you see `idx_paidparticipants_row_hash` in results

**Without this index, entry passes will be slow!**

---

## 📊 Load Test Summary

✅ **System tested with 100 concurrent users**
✅ **Average response: 379ms (very fast!)**
✅ **Zero timeouts or failures**
✅ **Ready for production**

---

## 🎯 What to Watch During Event

### Normal Behavior ✅

- Entry passes load in 1-2 seconds
- Check-in PIN works immediately
- No error messages
- Smooth user experience

### Warning Signs ⚠️

- Entry passes take >5 seconds to load
- Multiple users reporting errors
- Supabase dashboard shows high CPU
- Edge Function errors in logs

---

## 🚨 Emergency Procedures

### If Entry Pass Won't Load

1. Ask user to refresh the page
2. Try different browser
3. Check if they have internet connection
4. Verify URL is complete (has token after `/pass/`)
5. **Fallback:** Manual check-in from printed list

### If Check-in PIN Not Working

1. Verify user entered correct PIN
2. Check if too many failed attempts (15-min lockout)
3. **Fallback:** Use admin panel to manually check them in

### If System Completely Down

1. Check Supabase status: https://status.supabase.com/
2. Check your internet connection
3. **Fallback:** Use printed participant list for manual check-in
4. Record check-ins and update system later

---

## 📱 Quick Access Links

- **Admin Panel:** https://raja-ticketing-s.vercel.app/
- **Supabase Dashboard:** https://supabase.com/dashboard/project/qhpnjpjotcehjabfdovp
- **Supabase Status:** https://status.supabase.com/
- **Load Test Results:** See `LOAD_TEST_RESULTS.md`

---

## 💡 Pro Tips

1. **Early Arrivals:** Process them normally, system handles early load well
2. **Peak Rush:** Don't panic! System tested for 100 simultaneous users
3. **Slow Internet:** Entry passes work on 4G/5G if venue WiFi is slow
4. **Multiple Devices:** Have 2-3 devices ready for check-in
5. **Staff Training:** Show staff how to use admin check-in panel

---

## 📞 Support Contacts

- **Your Supabase Project:** qhpnjpjotcehjabfdovp
- **Supabase Support:** https://supabase.com/support
- **Vercel Support:** https://vercel.com/help

---

## 🎉 Confidence Boosters

✅ System passed load test with 100 concurrent users  
✅ Response times under 500ms for 95% of requests  
✅ Zero failures during stress testing  
✅ Auto-scaling infrastructure handles spikes  
✅ Security measures working perfectly  
✅ Backup procedures in place

**You've got this! Your system is ready! 🚀**

---

_Print this page and keep it handy during the event_


