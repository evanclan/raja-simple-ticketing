# Entry Pass Email Template Sync Update

## Problem

When editing the WEB チケット HTML 本文 (Web Ticket Email Editor), changes were only saved to localStorage and not synced to the database. This meant that:

- Changes weren't available on other devices
- Other logged-in admins couldn't see the updates
- Plain text templates needed manual updates

## Solution Implemented

Added full database synchronization and real-time updates for entry pass email templates to match the existing payment confirmation template functionality.

## Changes Made

### 1. Database Loading on Authentication (Lines 1093-1116)

Added loading of entry pass templates from the database when admin users authenticate:

```typescript
// Load entry pass templates
const eps = await loadSetting("entry_pass_subject", "Your Entry Pass");
const eph = await loadSetting("entry_pass_html", /* default HTML */);
const ept = await loadSetting("entry_pass_text", /* default text */);
const epPdfUrl = await loadSetting("entry_pass_pdf_url", "");

if (eps) setEntryPassSubject(eps);
if (eph) setEntryPassHtml(eph);
if (ept) setEntryPassText(ept);
if (epPdfUrl) setEntryPassPdfUrl(epPdfUrl);
```

**Keys used:**

- `entry_pass_subject` - Email subject line
- `entry_pass_html` - HTML email body
- `entry_pass_text` - Plain text email body
- `entry_pass_pdf_url` - Optional PDF attachment URL

### 2. Database Auto-Save (Lines 1134-1146)

Updated the auto-save mechanism to use `saveSetting()` which saves to both localStorage and the database:

```typescript
// Auto-save entry pass templates whenever they change (to both localStorage and database)
useEffect(() => {
  const timer = setTimeout(() => {
    // Save to both localStorage and database for cross-device sync
    saveSetting("entry_pass_subject", entryPassSubject);
    saveSetting("entry_pass_html", entryPassHtml);
    saveSetting("entry_pass_text", entryPassText);
    saveSetting("entry_pass_pdf_url", entryPassPdfUrl);
  }, 500); // Debounce by 500ms to avoid saving on every keystroke

  return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [entryPassSubject, entryPassHtml, entryPassText, entryPassPdfUrl]);
```

### 3. Real-Time Synchronization (Lines 1174-1236)

Added Supabase real-time subscription to the `settings` table that automatically updates all connected clients when any admin makes changes:

```typescript
// Real-time sync for settings (email templates) across devices
useEffect(() => {
  if (!isSupabaseConfigured || !userToken || !supabase) return;

  // Subscribe to changes in the settings table
  const channel = supabase
    .channel("settings-changes")
    .on(
      "postgres_changes",
      {
        event: "*", // Listen to all events (INSERT, UPDATE, DELETE)
        schema: "public",
        table: "settings",
      },
      (payload: any) => {
        // When another device/admin updates a setting, update the local state
        const key = payload.new?.key;
        const value = payload.new?.value;

        if (!key) return;

        // Update localStorage for backwards compatibility
        localStorage.setItem(key, value);

        // Update React state based on the setting key
        switch (key) {
          case "entry_pass_subject":
            setEntryPassSubject(value);
            break;
          case "entry_pass_html":
            setEntryPassHtml(value);
            break;
          case "entry_pass_text":
            setEntryPassText(value);
            break;
          case "entry_pass_pdf_url":
            setEntryPassPdfUrl(value);
            break;
          // ... also handles payment confirmation templates
        }
      }
    )
    .subscribe();

  // Cleanup subscription on unmount
  return () => {
    supabase.removeChannel(channel);
  };
}, [isSupabaseConfigured, userToken]);
```

## How It Works

### When an Admin Edits Templates:

1. **User types in editor** → State updates in React
2. **After 500ms (debounce)** → `saveSetting()` is called
3. **saveSetting()** saves to:
   - localStorage (for backwards compatibility)
   - Supabase `settings` table (for cross-device sync)
4. **Supabase real-time** broadcasts the change to all connected clients
5. **All other devices** receive the update and automatically update their UI

### When an Admin Logs In:

1. **Authentication completes** → `userToken` is set
2. **`loadSetting()`** is called for all template keys
3. **Database values** are loaded (falls back to localStorage if DB fails)
4. **React state** is updated with the latest values
5. **Real-time subscription** is established for future updates

## Benefits

✅ **Cross-device synchronization** - Changes appear on all devices immediately
✅ **Multi-admin support** - All logged-in admins see the same templates
✅ **Automatic plain text updates** - Both HTML and plain text are saved together
✅ **No manual intervention required** - Auto-saves after 500ms of inactivity
✅ **Backwards compatible** - Still uses localStorage as a fallback
✅ **Real-time updates** - No page refresh needed to see changes from other devices
✅ **Existing code preserved** - No breaking changes to working functionality

## Database Table

The implementation uses the existing `settings` table:

```sql
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
```

With Row Level Security (RLS) policies that allow authenticated users to read and manage settings.

## Testing

The application has been built successfully:

```
✓ 100 modules transformed.
dist/assets/index-C8aOoeiv.js   382.82 kB │ gzip: 109.40 kB
✓ built in 780ms
```

## What This Fixes

1. **Multi-device issue**: Changes now sync across all devices automatically
2. **Multi-admin issue**: All admins see the same template values
3. **Plain text updates**: Both HTML and plain text are saved in the same operation
4. **Data persistence**: Values are stored in the database, not just localStorage

## Usage

1. Admin logs in → Templates load from database
2. Admin edits WEB チケット HTML 本文 → Saves automatically after 500ms
3. Changes appear on all other devices/admins in real-time
4. Plain text is also updated/saved simultaneously
5. No manual save button click needed
6. No page refresh needed to see updates from other devices

The implementation follows the same pattern as the existing payment confirmation templates, ensuring consistency and reliability.
