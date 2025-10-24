# 🔑 How to Get Your Testing Information

Quick guide to find the information you need for load testing.

---

## 1️⃣ Get Your Supabase URL

### Method 1: From Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **Settings** (gear icon) in sidebar
4. Click **API**
5. Copy **Project URL**

**Format**: `https://xxxxxxxxxxxxx.supabase.co`

### Method 2: From Your Code

Look in your `.env` or `.env.local` file:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
```

---

## 2️⃣ Get Your Anon Key

### From Supabase Dashboard

1. Same place as above: **Settings** → **API**
2. Find **Project API keys**
3. Copy **anon/public** key (NOT the service_role key!)

**Format**: Starts with `eyJhbGci...` (very long, ~200+ characters)

### From Your Code

Look in your `.env` or `.env.local` file:

```
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

---

## 3️⃣ Get a Test Token

### Option A: Easy Way (From Your App)

1. **Open your deployed app**: `https://your-app.vercel.app`
2. **Login as admin**
3. **Go to participants page**
4. **Click on any participant**
5. **Click "Send Entry Pass"** button
6. **Look at the generated URL**:
   ```
   https://your-app.vercel.app/pass/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJy...
   ```
7. **Copy everything after `/pass/`**

That's your test token! ✅

### Option B: From Database (If you have SQL access)

```sql
-- 1. Get a row_hash from your database
SELECT row_hash, data
FROM paidparticipants
LIMIT 1;

-- 2. Copy the row_hash value
-- 3. Then you need to call your Edge Function to generate a token
--    (easier to use Option A above)
```

---

## 📋 Command Template

Once you have all three pieces of information:

```bash
npm run load-test 100 \
  https://xxxxxxxxxxxxx.supabase.co \
  eyJhbGci[YOUR-ANON-KEY]... \
  eyJhbGci[YOUR-TEST-TOKEN]...
```

### Real Example:

```bash
npm run load-test 100 \
  https://abcdefgh.supabase.co \
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTAwMDAwMDAsImV4cCI6MTkwNTU3NjAwMH0.abc123xyz \
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyaCI6InRlc3QtaGFzaC0xMjM0NTYiLCJpYXQiOjE3Mjk1MzYwMDAsImV4cCI6MTczNDcyMDAwMH0.xyz789abc
```

---

## ⚠️ Common Mistakes

### ❌ Using Service Role Key

**DON'T use**: The key that says "service_role" (this is secret!)
**DO use**: The key that says "anon" or "public"

### ❌ Including Quotes

**Wrong**: `"eyJhbGci..."`
**Right**: `eyJhbGci...`

### ❌ Missing Part of Token

**Wrong**: `eyJhbGci.eyJy.xyz` (incomplete)
**Right**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyaCI6InRlc3QtaGFzaC0xMjM0NTYiLCJpYXQiOjE3Mjk1MzYwMDAsImV4cCI6MTczNDcyMDAwMH0.xyz789abc` (complete)

---

## 🧪 Test Your Credentials First

Before running the full load test, verify your credentials work:

```bash
# Test with just 1 request
npm run load-test 1 YOUR-SUPABASE-URL YOUR-ANON-KEY YOUR-TEST-TOKEN
```

If you see:

- ✅ `Success` → Credentials are correct!
- ❌ `HTTP 401` → Check your anon key
- ❌ `HTTP 403` or `Invalid token` → Check your test token
- ❌ `Failed to fetch` → Check your Supabase URL

---

## 🎯 Quick Checklist

```
[ ] Got Supabase URL (https://xxx.supabase.co)
[ ] Got Anon Key (starts with eyJhbGci, ~200 chars)
[ ] Got Test Token (starts with eyJhbGci, from entry pass URL)
[ ] Tested with 1 user - Success!
[ ] Ready to run full load test
```

---

## 🆘 Still Stuck?

### Can't find Supabase URL?

Check your environment variables or `.env` files in your project.

### Can't find Anon Key?

It's in Supabase Dashboard → Settings → API → "anon public" key

### Can't get Test Token?

Try:

1. Login to your app as admin
2. Send an entry pass to a test participant
3. Copy the URL from the success message
4. Extract the token (part after `/pass/`)

---

**Next**: Once you have all three, go to `verify-setup.md` for the full testing guide! 🚀
