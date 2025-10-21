# Auto-Save Update for Email Templates

## Problem

When editing email templates in the 自動メール編集 (Automatic Email Editing) module, changes were not persisting after refreshing the page, even after clicking the save button.

## Solution Implemented

Added automatic save functionality using React's `useEffect` hook with debouncing to preserve all email template changes.

## Changes Made

### 1. Payment Confirmation Email Templates Auto-Save

**Location:** `src/App.tsx` (lines 1037-1048)

Added a new `useEffect` hook that automatically saves the following fields to localStorage whenever they change:

- `subjectTemplate` - Email subject
- `htmlTemplate` - HTML email body
- `textTemplate` - Plain text email body
- `fromDisplay` - Sender email address

**Features:**

- 500ms debounce to avoid saving on every keystroke
- Automatically persists changes without manual save button click
- Still loads from localStorage on page refresh

### 2. Entry Pass Email Templates Auto-Save

**Location:** `src/App.tsx` (lines 1050-1060)

Added auto-save for entry pass templates:

- `entryPassSubject` - Entry pass email subject
- `entryPassHtml` - Entry pass HTML body
- `entryPassText` - Entry pass plain text body
- `entryPassPdfUrl` - PDF attachment URL

### 3. UI Updates

**Locations:**

- Line 2301-2304 (Payment confirmation editor)
- Line 2479-2482 (Entry pass editor)

- Removed the manual "保存" (Save) button
- Added "✓ 自動保存有効 (Auto-save enabled)" indicator
- Kept the "既定にリセット" (Reset to Default) button

## How It Works

1. **On Page Load:** Templates are loaded from `localStorage` (existing functionality)
2. **During Editing:** Every change triggers the `useEffect` hook
3. **After 500ms:** If no new changes occur, the template is automatically saved to `localStorage`
4. **On Refresh:** Latest saved templates are loaded automatically

## Benefits

✅ No more lost changes when refreshing the page
✅ No need to remember to click the save button
✅ Immediate persistence of edits (with 500ms debounce)
✅ Works for both payment confirmation and entry pass emails
✅ User-friendly visual indicator showing auto-save is enabled

## Testing

The application has been built successfully and is ready to use:

```
✓ 100 modules transformed.
dist/assets/index-Cj09WSMd.js   378.25 kB │ gzip: 108.32 kB
✓ built in 730ms
```

## Usage

1. Navigate to the 自動メール編集 (Automatic Email Editing) section
2. Edit any template field (subject, HTML, text, from)
3. Wait 500ms after your last keystroke
4. Changes are automatically saved
5. Refresh the page - your changes will be preserved!

The same applies to the 入場パス メール編集 (Entry Pass Email Editor).
