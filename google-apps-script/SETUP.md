# Field Routing Auto-Sync Setup

## What This Does
Automatically pulls CRM data into your Google Sheet's "Routing(Field Use)" tab:
- **Refreshes when you open the spreadsheet**
- **Refreshes every hour** (even when closed)
- **Preserves your manual entries** in ORIG, CALL, AS?, and Duplicate? columns

## One-Time Setup (5 minutes)

1. **Open your Google Sheet**
   [Field Routing Sheet](https://docs.google.com/spreadsheets/d/1zcVCVIciyScC3IcclfuBy4T4ogdcNSBVlxn6ZmYeiG0/edit?gid=150527751)

2. **Open the Script Editor**
   Go to **Extensions → Apps Script**

3. **Paste the Script**
   - Delete any existing code in the editor
   - Copy the entire contents of `FieldRoutingSync.gs` and paste it in
   - Click the **Save** icon (or Ctrl+S)

4. **Install Triggers**
   - In the Apps Script editor, select `installTriggers` from the function dropdown (top toolbar)
   - Click **Run**
   - When prompted, click **Review Permissions → Allow**
   - You'll see a confirmation popup: "Triggers installed successfully!"

5. **Done!** Close the Apps Script editor. Your sheet will now auto-sync.

## How It Works
- Queries your Supabase database directly (same connection as the CRM)
- Rebuilds all physician + location rows with the same logic as the CRM export
- Matches rows by "First Last + Facility" to preserve your manual entries
- Adds a "Last synced" timestamp at the bottom of the data

## Manual Refresh
A **WoundCare CRM** menu appears at the top of the sheet. Click it → **Refresh Now** to sync immediately.

## Column Mapping
| Column | Source | Editable in Sheet? |
|--------|--------|--------------------|
| ORIG | — | Yes (preserved on sync) |
| CALL | — | Yes (preserved on sync) |
| AS? | — | Yes (preserved on sync) |
| Rank | Physician Priority (1-5) | No (overwritten) |
| Physician First/Last Name | Physician record | No |
| Degree | Physician degree | No |
| Duplicate? | — | Yes (preserved on sync) |
| Status | Latest contact log entry | No |
| Specialty | Physician specialty | No |
| Facility | Practice name | No |
| Address/City/Zip/Phone | Practice location | No |
| Vol | Patient volume | No |
| County | Auto-detected from city | No |
| Notes | Physician general notes | No |
