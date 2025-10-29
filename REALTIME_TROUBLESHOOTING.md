# Real-time Check-in Updates - Troubleshooting Guide

**Issue:** Check-in list not updating automatically - need to refresh page

---

## 🔍 Step 1: Check Browser Console

1. Open your browser's Developer Tools (F12 or Right-click → Inspect)
2. Go to the **Console** tab
3. Open the check-in list page: `/checkins`
4. Look for these messages:

### ✅ If you see:
```
🔄 Setting up realtime subscription for checkins...
📡 Realtime subscription status: SUBSCRIBED
✅ Successfully subscribed to realtime updates!
```
**This is GOOD** - Real-time is working! The issue is elsewhere.

### ❌ If you see:
```
🔄 Setting up realtime subscription for checkins...
📡 Realtime subscription status: CHANNEL_ERROR
❌ Realtime subscription error - check if Realtime is enabled in Supabase dashboard
```
**This is the problem** - Real-time is NOT enabled in Supabase. Continue to Step 2.

### ⚠️ If you see nothing:
The subscription might be failing silently. Continue to Step 2.

---

## 🔧 Step 2: Enable Real-time in Supabase Dashboard

**This is the most common fix!** Supabase Real-time must be manually enabled for each table.

### Instructions:

1. **Go to Supabase Dashboard**
   - Visit: https://supabase.com/dashboard
   - Open your project (look for project ID: `qhpnjpjotcehjabfdovp`)

2. **Navigate to Database → Replication**
   - Click on **Database** in the left sidebar
   - Click on **Replication** tab

3. **Enable Real-time for `checkins` table**
   - Find the `checkins` table in the list
   - Toggle the switch to **ON** (enable)
   - The toggle should turn green

4. **Verify the settings**
   - Make sure these events are enabled:
     - ✅ INSERT
     - ✅ UPDATE
     - ✅ DELETE

5. **Wait 10-30 seconds**
   - Changes take a moment to propagate

6. **Refresh your check-in page**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Check the console again for the subscription status

---

## 🧪 Step 3: Test Real-time Updates

After enabling Real-time:

1. **Open check-in list on Device 1**
   - URL: https://raja-ticketing-s.vercel.app/checkins
   - Open browser console (F12)

2. **Open check-in list on Device 2** (or another tab)
   - Same URL
   - Keep both visible side-by-side

3. **Perform a test check-in**
   - Use a test ticket or scan a real ticket
   - Complete the check-in process

4. **Watch Device 1**
   - Should see console message: `✨ New check-in detected via realtime:`
   - The new entry should appear in the list automatically
   - No refresh needed!

---

## 🐛 Other Possible Issues

### Issue: Browser Tab in Background
**Symptom:** Updates stop when tab is inactive for a long time

**Solution:**
- Some browsers throttle background tabs
- Bring the tab to foreground
- If updates resume, this is normal browser behavior
- Consider keeping the check-in list visible during the event

### Issue: Network Connectivity
**Symptom:** Console shows connection errors

**Solution:**
- Check internet connection
- Try different network/wifi
- Check if firewall is blocking WebSocket connections
- Verify Supabase status: https://status.supabase.com/

### Issue: Browser Cache
**Symptom:** Old code is running

**Solution:**
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Or clear browser cache
- Close and reopen the browser

### Issue: Supabase Real-time Quota
**Symptom:** Working then suddenly stops

**Solution:**
- Check your Supabase project dashboard
- Go to Settings → Billing
- Verify you haven't hit any limits
- Free tier includes: 200k Real-time messages/month (more than enough!)

---

## 📊 Expected Console Messages

### When page loads:
```
🔄 Setting up realtime subscription for checkins...
📡 Realtime subscription status: SUBSCRIBED
✅ Successfully subscribed to realtime updates!
```

### When someone checks in:
```
✨ New check-in detected via realtime: {payload object}
✅ Added new check-in to list: [Name]
```

### When check-in is deleted:
```
🗑️ Check-in deleted via realtime: {payload object}
```

### When absence is updated:
```
🔄 Check-in updated via realtime: {payload object}
```

### When page closes:
```
🔌 Cleaning up realtime subscription
```

---

## 🆘 If Still Not Working

### Quick Workaround
If you need the system working NOW for your event:
- Manual refresh still works perfectly
- Press F5 or click refresh button
- All check-ins will appear
- Entry pass system unaffected

### Get More Information

1. **Take a screenshot of browser console**
   - Open console (F12)
   - Take screenshot of any errors
   - Share with developer

2. **Check Supabase logs**
   - Go to Supabase Dashboard → Logs
   - Look for any Real-time errors
   - Note the timestamp

3. **Verify table exists**
   - Go to Database → Tables
   - Confirm `checkins` table exists
   - Check if it has data

---

## ✅ Success Checklist

- [ ] Opened browser console and checked for messages
- [ ] Went to Supabase Dashboard → Database → Replication
- [ ] Enabled Real-time for `checkins` table
- [ ] Waited 30 seconds for changes to propagate
- [ ] Hard refreshed the browser (Cmd+Shift+R / Ctrl+Shift+R)
- [ ] Saw "SUBSCRIBED" message in console
- [ ] Tested with a check-in on two devices
- [ ] New check-in appeared automatically without refresh

---

## 📞 Need Help?

If you've completed all steps and it's still not working:

1. Check that you're on the latest deployment
2. Verify Supabase project is not in maintenance mode
3. Test on different browser (Chrome, Firefox, Safari)
4. Check if ad-blockers are interfering with WebSockets

The system is designed to work without real-time (manual refresh works), so your event can proceed regardless!

---

_Last updated: October 29, 2025_

