# Database Migration Instructions

## ⚠️ IMPORTANT: Run This Migration Before Deploying

Your email templates will now sync across devices! But first, you need to create the `settings` table in your database.

## Option 1: Using Supabase Dashboard (Easiest)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** (in the left sidebar)
4. Click **+ New query**
5. Copy and paste the contents of `supabase/migrations/create_settings_table.sql`
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. You should see "Success. No rows returned"

## Option 2: Using Supabase CLI

```bash
# If you have Supabase CLI installed
npx supabase db push

# Or if you have it globally installed
supabase db push
```

## What This Does

- ✅ Creates a `settings` table to store email templates
- ✅ Enables Row Level Security (RLS)
- ✅ Sets up policies for authenticated users
- ✅ Inserts default email templates
- ✅ Creates an index for fast lookups

## After Migration

Once the migration is complete:
1. Deploy your code (the migration is safe to run multiple times)
2. Your email template edits will now sync across all devices
3. Open the app on a different device and you'll see your saved templates!

## Testing

1. Edit your confirmation email on Device A
2. Wait 1-2 seconds for auto-save
3. Open the app on Device B (or refresh)
4. Your edits should appear on Device B! 🎉

## Troubleshooting

If templates don't sync:
- Check that you're logged in (templates sync per user)
- Check browser console for any errors
- Verify the `settings` table exists in your database
- Try manually saving by clicking "テスト送信" button

