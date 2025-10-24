# 欠席追跡機能 (Absence Tracking Feature)

## ✅ What Was Implemented

The absence tracking feature has been successfully implemented! This allows you to track family members who checked in but cannot attend due to illness or other reasons.

### Features Added:

1. **Database Columns**: Added to `checkins` table
   - `absent_adults` - Number of absent adults
   - `absent_children` - Number of absent children  
   - `absent_infants` - Number of absent infants
   - `absence_note` - Optional reason (e.g., "体調不良")

2. **UI Components**:
   - ✅ **欠席登録** button in チェックイン済みの参加者 table
   - ✅ Modal dialog for entering absence counts
   - ✅ Validation to prevent invalid entries
   - ✅ Visual display showing: `3 → 2` (strikethrough original, shows actual)
   - ✅ Button changes to **欠席編集** when absences already registered

3. **Updated Display**:
   - Shows both checked-in count and actual attendance
   - Strikethrough for numbers with absences: ~~3~~ → 2
   - Updated totals showing:
     - 登録済み家族数 (Registered families)
     - チェックイン総人数 (Total checked-in)
     - **実際の参加人数** (Actual attendance) - in bold
     - **(欠席: X名)** - Absence count in red if > 0

4. **Mobile-Friendly**: 
   - Responsive modal design
   - Clean button layout
   - Easy number input with validation

---

## 🔧 Setup Required - IMPORTANT!

### Step 1: Apply Database Migration

You need to run the SQL migration to add the new columns to your database.

**Option A: Via Supabase Dashboard (Recommended)**

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** (left sidebar)
3. Open the file: `APPLY_ABSENCE_TRACKING.sql` from your project
4. Copy all the SQL and paste it into the SQL Editor
5. Click **Run** button
6. Verify success (should show the new columns at the bottom)

**Option B: Via Terminal**
```bash
npx supabase db push
```
(Note: This may have migration history conflicts. If it fails, use Option A.)

### Step 2: Verify Database Changes

Run this query in Supabase SQL Editor to verify:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'checkins'
AND column_name IN ('absent_adults', 'absent_children', 'absent_infants', 'absence_note');
```

You should see 4 rows returned.

### Step 3: Test the Feature

1. Wait for Vercel deployment to complete (should be done automatically)
2. Go to your admin dashboard
3. Navigate to チェックイン済みの参加者 section
4. You should see the new **欠席登録** button for each family
5. Click it and test registering absences

---

## 📱 How to Use

### Registering Absences:

1. In チェックイン済みの参加者 table, find the family
2. Click **欠席登録** button
3. Modal opens showing:
   ```
   【欠席者登録】田中太郎様の家族
   
   チェックイン人数:
   • 大人: 3名
   • こども: 2名
   • 赤ちゃん: 1名
   
   欠席人数を入力:
   大人: [1] / 3名
   こども: [0] / 2名
   赤ちゃん: [1] / 1名
   
   理由 (任意):
   [体調不良のため]
   
   [保存] [キャンセル]
   ```

4. Enter absence counts (validation prevents exceeding checked-in numbers)
5. Optionally add a reason
6. Click **保存**

### After Saving:

- Table shows: `大人: 3 → 2` (1 absent)
- Button changes to **欠席編集**
- Totals update automatically:
  - チェックイン総人数: 50
  - 実際の参加人数: 47
  - (欠席: 3名)

### Editing Absences:

- Click **欠席編集** button
- Modal opens with current values
- Update and save

---

## 🎯 Benefits

✅ **Accurate Attendance**: Know exactly who's attending vs who checked in  
✅ **Food Planning**: Adjust catering based on actual attendance  
✅ **Documentation**: Keep notes on why people couldn't attend  
✅ **Reversible**: Can update if someone shows up late  
✅ **Non-Destructive**: Original check-in data preserved  
✅ **Real-time**: Updates immediately, no refresh needed  

---

## 📊 Data Storage

All absence data is stored in the `checkins` table:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `absent_adults` | integer | 0 | Count of absent adults |
| `absent_children` | integer | 0 | Count of absent children |
| `absent_infants` | integer | 0 | Count of absent infants |
| `absence_note` | text | '' | Optional reason |

Original check-in data in `paidparticipants` remains unchanged.

---

## 🚀 Deployment Status

✅ Code pushed to GitHub  
✅ Vercel auto-deployment triggered  
⚠️ **ACTION REQUIRED**: Run database migration (see Step 1 above)  

Once you complete Step 1, the feature will be fully functional on your live site!

---

## 🆘 Troubleshooting

**Q: I don't see the 欠席登録 button**
- Check Vercel deployment completed
- Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
- Clear browser cache

**Q: I get a database error when clicking 欠席登録**
- The migration hasn't been applied yet
- Follow Step 1 above to add database columns

**Q: The validation message appears even with valid numbers**
- Make sure absence count ≤ checked-in count
- Check that you're entering numbers, not text

**Q: Can I reverse an absence registration?**
- Yes! Click 欠席編集 and set all counts to 0

---

## 📝 Notes

- Absence counts are per family (not individual names)
- The feature works for both admin check-ins and self check-ins
- Absences don't affect the original check-in record
- You can track the reason for future reference
- The system prevents negative attendance (absences can't exceed check-ins)

---

Need help? Check the console for error messages or contact support.

