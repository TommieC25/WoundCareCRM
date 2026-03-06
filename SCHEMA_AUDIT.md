# Schema Audit — WoundCareCRM
**Date:** 2026-03-06
**Auditor:** Claude Code (automated review of JS codebase)

---

## `target` vs `is_target` Columns on `providers` Table

### Summary
The JS codebase **exclusively uses `is_target`**. The column `target` is not referenced anywhere in the application code.

### Evidence from JS codebase
- `profile.js`: Renders `p.is_target` for the "Sales Target" toggle
- `modals.js`: Reads `$('isTarget').checked`, saves `is_target: !!value` on update
- `modals.js`: `toggleTarget()` → `db.from('providers').update({is_target: newVal})`
- `admin.js`: CSV import maps `r.is_target === 'Y'` → boolean; routing export uses `p?.is_target ? 'Y' : ''`
- `admin.js`: No reference to a plain `target` column anywhere

### Recommended Action
1. **Verify** in Supabase whether a `target` column exists at all:
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'providers'
   AND column_name IN ('target', 'is_target');
   ```
2. **Check for data** (if both columns exist):
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE target IS NOT NULL) as target_count,
     COUNT(*) FILTER (WHERE is_target IS NOT NULL) as is_target_count,
     COUNT(*) FILTER (WHERE target IS NOT NULL AND is_target IS NOT NULL) as both_count
   FROM providers;
   ```
3. **If `target` column has no data**: Safe to ignore (or drop if confirmed empty).
4. **If `target` has data not in `is_target`**: Migrate before dropping.
5. **No JS changes needed** — the app already uses `is_target` correctly.

---

## `practices.website` Field
- **Status:** ALREADY EXISTS in DB schema and UI
- `profile.js` renders `p.website` as a clickable link in the practice profile
- No action needed

## `practices.email` Field
- **Status:** NOT YET in DB schema (email lives on `practice_locations.practice_email`)
- Adding email directly to the `practices` table requires:
  ```sql
  ALTER TABLE practices ADD COLUMN email VARCHAR(255);
  ```
- UI updates added in this PR (see practice profile/modal changes)
- **Tom: run the SQL above in Supabase before using the new email field**

---

## Notes
- `practice_email` column on `practice_locations` is the per-location office email (already supported)
- New `practices.email` column would be for the practice's primary/main email address
