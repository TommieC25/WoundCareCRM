# WoundCareCRM — Claude Code Context

## Project Overview
Single-page territory CRM for Miami wound care sales. `index.html` + `js/` folder (admin.js, data.js, views.js, nav.js, modals.js, profile.js, contact.js, init.js). No build system, no framework — vanilla HTML/CSS/JS with Supabase backend. Deployed via GitHub Pages from `main` branch.

## Git & Deployment
- **Default branch: `main`** (NOT master)
- Push to `claude/` feature branch → create PR → merge — **Claude should handle all steps autonomously** (do NOT ask user to create PRs or merge manually)
- After merge, GitHub Pages auto-deploys from `main`
- User does a hard refresh in browser to pick up changes

## Tech Stack
- **Frontend**: Single `index.html` — inline CSS + JS, no external frameworks
- **Backend**: Supabase (PostgreSQL) via `@supabase/supabase-js` CDN
- **Maps**: Leaflet.js for map view
- **Hosting**: GitHub Pages

## Supabase Database Tables
| Table | Purpose |
|-------|---------|
| `providers` | HCPs — first_name, last_name, degree, title, email, specialty, priority (1-5 tier), academic_connection, proj_vol (projected volume, replaces patient_volume), ss_vol (skin substitute CMS claims volume), general_notes, last_contact, is_target |
| `practices` | Practice groups — name, website, notes |
| `practice_locations` | Physical offices — practice_id, label, address, city, zip, phone, fax, practice_email, office_hours, office_staff, receptionist_name, best_days |
| `provider_location_assignments` | Many-to-many — provider_id, practice_location_id, is_primary |
| `contact_logs` | Activity notes — provider_id, contact_date, contact_time, author, notes, practice_location_id, reminder_date |

**Note**: Table was renamed from `physicians`→`providers` and `physician_location_assignments`→`provider_location_assignments`. CLAUDE.md previously had the old names — all JS files use the new names.

## Key Architecture Patterns
- All data loaded into JS arrays on startup: `physicians`, `practices`, `practiceLocations`, `physicianAssignments` (object keyed by physician_id), `contactLogs` (lazy-loaded per physician)
- Realtime subscriptions via Supabase channels auto-refresh on external changes
- `fmtName(p)` formats physician display name with degree/title
- `withSave(btnId, label, fn)` handles save button state transitions
- Views: physicians list (tab label: "HCPs"), practices list, activity log, map, dashboard
- Routing export tracks export history in localStorage to show NEW vs previously exported rows

## Task Detail Modal (added PR #49, 2026-02-21)
- Clicking any Task card (Tasks view or Home view reminders) opens `taskDetailModal` instead of navigating to the full provider profile
- **Global**: `let _taskDetailLogs = {}` in `js/views.js` — a map of `log.id → log record`, populated by `renderTasksView()` and `renderEmptyState()` (nav.js) whenever reminder cards are rendered
- **Functions**: `openTaskDetailModal(logId)` and `closeTaskDetailModal()` in `js/views.js`
- Modal shows: provider name + tier badge (or "Staff" badge if `specialty === 'Administrative Staff'`), specialty, email, practice name + location details, reminder status chip (Overdue/Upcoming/Open), full note text
- Action buttons: ✓ Mark Complete (calls `completeReminder` then re-renders), ✏️ Edit Note (closes modal, calls `editNoteFromActivity`), 🗑️ Delete (closes modal, calls `deleteNoteFromActivity`), 👤 View Full Profile (closes modal, navigates to provider profile)
- The `_taskDetailLogs` map in nav.js is assigned to `window._taskDetailLogs` so it's accessible from views.js functions

## CSV Import Format
Expects columns: first_name, last_name, email, priority, specialty, degree, title, proj_vol (or patient_volume for backward compat), ss_vol, academic_connection/um_connection, general_notes, is_target, practice_name, address, city, zip, phone, fax, office_hours, office_staff, receptionist_name, best_days, practice_email

**Facility-only rows** (no first_name/last_name): creates the practice + location only, no provider record.

**Address normalization** (applied automatically on import, in `js/admin.js`):
- Strips `nan` word tokens (pandas NaN artifact): `173 Magnolia Way nan` → `173 Magnolia Way`
- Suite/unit → `#NNN`: `Suite 250`, `Suite #250`, `Ste 406` → `#250`, `#250`, `#406`
- Directional abbreviations uppercased: `Sw`, `Nw`, `Northwest` → `SW`, `NW`, `NW`

**Paste-CSV option**: Admin panel has a textarea for pasting CSV text directly (iPad-friendly). Functions: `importCSVPaste()`, `importCSVText(str)` in admin.js — both duck-type into `importCSV()`.

**Supabase network note**: The Claude Code server environment has outbound HTTPS blocked to external hosts (`403 host_not_allowed`). Server-side import scripts cannot reach Supabase. All imports must run through the browser. Git push works via local proxy (127.0.0.1:61248). GitHub REST API (`api.github.com`) is **session-dependent** — sometimes allowed, sometimes not. Always check before assuming PR creation will work.

## Export Formats
- **Providers CSV** (UI label; formerly "Physicians CSV"): All providers with practice info, degree, last contact, Status (latest activity)
- **Contact Logs CSV**: All activity with dates, locations, notes
- **Practices CSV**: All locations with details
- **Field Routing CSV**: Matches Google Sheet "Routing(Field Use)" tab — includes Status column with latest activity per provider

## Naming Conventions
- "Academic Connection" (UI label) = `academic_connection` column (formerly `um_connection`, still falls back to it)
- "Projected Volume" (UI) = `proj_vol` column (falls back to `mohs_volume`; formerly `patient_volume`)
- Priority 1-5 = Tier system (1 = highest)
- **Provider/HCP/Staff terminology** (as of PR #49, 2026-02-21):
  - People with medical degrees (MD, DO, DPM, PA-C, NP, RN, PhD) → **"Provider"** in full contexts, **"HCP"** where space is tight
  - Administrative/office staff (`specialty === 'Administrative Staff'`) → **"Staff"**
  - The DB table is now `providers` (renamed from `physicians`)
  - Tab label: "HCPs", search placeholder: "Search HCPs...", buttons: "+ New Provider", "Add Provider", "Save Provider", "Edit Provider"
  - Counts: "X provider(s)", "No providers found", "Providers & Staff" (section headers in profile)

## iOS Supabase SQL Editor Rules
**CRITICAL — violations have cost multiple failed attempts and wasted credits.**
When writing SQL to be copy-pasted into the Supabase SQL editor on iOS (Safari):
- **NEVER use single-letter table aliases** (especially `p` for providers — iOS treats `p.column` as an HTML `<p>` tag and wraps it in angle brackets, breaking the query)
- **NEVER use `table.column` dot notation in a SELECT clause** — iOS converts `SELECT providers.id` to `SELECT <providers.id>` on paste
- **ALWAYS use** `SELECT id FROM table` (no alias, no prefix) and `NOT IN (SELECT col FROM other_table)` instead of LEFT JOIN for filtering
- **SAFE pattern**: All WHERE clause references are fine (`WHERE provider_id = x`). Only the SELECT column list triggers the iOS HTML mangling
- When in doubt: write the simplest possible SQL with no aliases anywhere

## Common Gotchas
- The `degree` and `title` columns were added later (PRs #15-16) — always include them in inserts
- `practice_email` lives on `practice_locations` table, NOT on `practices`
- Contact note times are stored as `[HH:MM]` prefix in the notes text, parsed on display
- Reminder dates are stored as ISO date strings in `reminder_date` column on `contact_logs`
- County is guessed from city name via `guessCounty()` helper (Miami-Dade, Broward, Palm Beach)
- **JS template literals**: When editing HTML-generating template literals in views.js/nav.js, keep the entire string as a single contiguous template literal. Breaking it across lines with raw HTML outside the backtick string causes a JS syntax error. The whole `html += \`...\`` must be one unbroken string.
- **Merge conflicts when branch is behind main**: If a PR shows "not mergeable", the `claude/` branch has fallen behind. Fix: `git fetch origin main && git merge origin/main --no-edit`, resolve any conflicts (keep HEAD/our version), commit, re-push, then retry the merge API call.
- **NEVER use `sed -i` on source code files** — `sed -i` has silently wiped entire JS files to 0 bytes in this repo (PR #58 incident, 2026-02-23), costing significant credits and time to recover. **ALWAYS use the Edit tool for any source file modification**, no exceptions. Reserve Bash/sed exclusively for config files, non-source text, or throwaway temp files where a wipe would be harmless. For multi-file refactors, use Edit on each file individually, verify line counts before and after, and never chain sed commands across multiple source files in one Bash call.

## User Preferences
- User is Tom (tom@dynamicoach.com), operates on iPad primarily
- **NEVER ask Tom to do manual steps** — push, PR creation, merging, file access — handle EVERYTHING autonomously. Tom is paying for Claude Code to do the work. If something can't be automated, explain why and offer the closest alternative.
- Field routing sheet syncs with Google Sheets for daily field use via Apps Script (`google-apps-script/FieldRoutingSync.gs`)

## Google Sheets Integration
- Field Routing auto-syncs via Google Apps Script that queries Supabase REST API directly
- Sheet: https://docs.google.com/spreadsheets/d/1zcVCVIciyScC3IcclfuBy4T4ogdcNSBVlxn6ZmYeiG0/edit?gid=150527751
- Apps Script installed in the sheet with onOpen + hourly triggers
- Manual-entry columns (ORIG, CALL) are preserved across syncs; AS? is populated from CRM data
- Rows are pre-sorted by Zip → Address → Vol(desc) for field routing order
- Column widths are saved before sync and restored after
- Phone numbers are normalized to dash format (305-385-9494) via `fmtPhone_()` in Apps Script

## Claude Code Session Handoff Protocol

**READ THIS FIRST on every new session / conversation compaction.**

### Git Environment — FULLY WORKING (updated 2026-02-24, confirmed working through PR #66)
1. **Push access**: ONLY `claude/*` branches work via git. The remote is pre-configured as `http://local_proxy@127.0.0.1:61985/git/TommieC25/WoundCareCRM` — git push works with no extra setup.
2. **`gh` CLI**: NOT installed (command not found). Do not attempt any `gh` commands.
3. **GitHub REST API**: **Session-dependent** — `https://api.github.com` is only reachable if `api.github.com` is in the session's egress allowlist. Check with `curl -s https://api.github.com/zen` before trying. If blocked (`403 host_not_allowed`), push succeeds but PR creation/merge must be done manually by Tom on GitHub. Do NOT waste time probing — just push the branch and ask Tom to merge if the API is blocked.
4. **GitHub PAT**: Fine-grained token scoped to WoundCareCRM repo. Stored in `~/.github_pat` = `/root/.github_pat` (not in git). **CHECK FIRST**: `PAT=$(cat /root/.github_pat 2>/dev/null)`. If empty/missing, PAT is gone (new container) — see fallback below.
5. **Remote URL for git push**: Already set correctly via local proxy — do NOT try to reset it with a PAT. `git push -u origin <branch>` works as-is.
6. **Remote URL for GitHub API**: Direct `https://api.github.com` calls work only if the PAT file exists.

### What TO Do for Git (full autonomous workflow)
```bash
# Step 1: Check PAT exists FIRST — if missing, see fallback before proceeding
PAT=$(cat /root/.github_pat 2>/dev/null)
if [ -z "$PAT" ]; then echo "PAT MISSING — PR creation will fail. See fallback."; fi

# Step 2: Commit and push (git remote already configured, no setup needed)
git add <files> && git commit -m "..." && git push -u origin claude/<branch>

# Step 3: Create PR (requires PAT)
PR=$(curl -s -X POST -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  https://api.github.com/repos/TommieC25/WoundCareCRM/pulls \
  -d '{"title":"...","body":"...","head":"claude/...","base":"main"}')
PR_NUM=$(echo $PR | grep -o '"number":[0-9]*' | grep -o '[0-9]*')

# Step 4: Merge PR (requires PAT)
curl -s -X PUT -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  https://api.github.com/repos/TommieC25/WoundCareCRM/pulls/$PR_NUM/merge \
  -d '{"merge_method":"squash"}'

# Step 5: Delete the branch after merge — ALWAYS do this (Tom's SOP)
# The local git proxy does NOT support branch deletion (403 on push --delete)
# Use the GitHub API instead:
curl -s -X DELETE -H "Authorization: Bearer $PAT" \
  "https://api.github.com/repos/TommieC25/WoundCareCRM/git/refs/heads/claude/<branch>"
# If API is blocked: tell Tom to delete the branch on GitHub Branches page (trash icon)
# NEVER leave merged branches sitting — they accumulate and confuse the repo
```

### PAT Missing Fallback (new container session)
If `cat /root/.github_pat` returns nothing, the PAT was lost when the container was recreated. **Do NOT spend time probing ports or environment variables** — the PAT is not stored anywhere else accessible. Instead:
1. Push the branch (still works via local proxy)
2. Tell Tom: "Code is pushed to `claude/<branch>`. PAT is missing from this container — please run: `echo 'ghp_YOURTOKEN' > /root/.github_pat` and I'll complete the PR/merge."
3. Tom provides the token → run steps 3-4 above immediately.

### Queued Tasks for Next Session (logged 2026-02-28)

#### 1. Fix corrupted `specialty` field values in DB
Many providers have garbage data in `specialty` — county names ("Broward", "Palm Beach"), free-text strings, old picklist values, etc. These show up in the Field Routing sheet's Specialty column.
- **Valid specialties are EXACTLY**: `Dermatology`, `Podiatry`, `Wound Care`, `Other`
- `Dermatology` implicitly covers Mohs surgeons (no separate Mohs entry)
- Need a DB audit/migration: map all existing non-standard values → one of the 4 valid values (or `Other`)
- **Also fix in the CRM picklist**: the Specialty dropdown in the New Provider / Edit Provider form must show ONLY these 4 options — no freetext, no other values

#### 2. Fix corrupted Facility names (provider names appearing in Facility column)
Some providers in the Field Routing sheet show their own name (e.g. "Aaron Blom") in the Facility column instead of the practice name. This means their `practice_locations` record has no linked `practice_id` or the `practices` record has a bad/missing name.
- Audit providers where Facility = their own name
- Fix the practice linkage in Supabase (correct the `practices.name` or re-link `practice_id`)
- Vohra Wound Physicians group at 3601 SW 160th Ave (no suite) is the primary offender

#### 3. Re-paste & sync Apps Script after fixing data
After fixing specialty values and practice linkages, re-paste the current `google-apps-script/FieldRoutingSync.gs` into the Google Sheet (Extensions → Apps Script) and run Refresh Now to confirm clean output.

---

### Session Handoff Checklist
When picking up from a compacted/previous conversation:
1. Read `CLAUDE.md` (this file) first — **check Queued Tasks section above**
2. Run `git log --oneline -10` and `git branch -a` to understand current state
3. Check `git diff --stat origin/main...HEAD` to see what's pending
4. Do the actual work requested — don't re-explore known constraints
5. When providing code for Tom to copy-paste (e.g., Apps Script), output it as a **plain code block** — never use `<details>` collapse tags (they don't render on iPad)

### Output Rules for Tom (iPad User)
- No `<details>` / `<summary>` HTML tags — they collapse and can't be expanded on iPad
- No "see above" references — always include the actual content inline
- Keep code blocks plain and complete — Tom needs to select-all and copy
- **For ANY manual step (e.g. Apps Script, Google Sheets): always provide the COMPLETE file/code to paste — never diffs, never "find line X and replace" instructions. Partial instructions waste Tom's time and credits. Lead with the full paste-ready content immediately.**
