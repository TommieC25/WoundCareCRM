# WoundCareCRM — Claude Code Context

## Project Overview
Single-page territory CRM for Miami wound care sales. One file: `index.html` (~2400 lines). No build system, no framework — vanilla HTML/CSS/JS with Supabase backend. Deployed via GitHub Pages from `main` branch.

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
| `physicians` | HCPs — first_name, last_name, degree, title, email, specialty, priority (1-5 tier), academic_connection, proj_vol (projected volume, replaces patient_volume), ss_vol (skin substitute CMS claims volume), general_notes, last_contact |
| `practices` | Practice groups — name, website, notes |
| `practice_locations` | Physical offices — practice_id, label, address, city, zip, phone, fax, practice_email, office_hours, office_staff, receptionist_name, best_days |
| `physician_location_assignments` | Many-to-many — physician_id, practice_location_id, is_primary |
| `contact_logs` | Activity notes — physician_id, contact_date, contact_time, author, notes, practice_location_id, reminder_date |

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
Expects columns: first_name, last_name, email, priority, specialty, degree, title, proj_vol (or patient_volume for backward compat), academic_connection/um_connection, general_notes, practice_name, address, city, zip, phone, fax

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
  - The `physicians` DB table name is unchanged — only UI labels changed
  - Tab label: "HCPs", search placeholder: "Search HCPs...", buttons: "+ New Provider", "Add Provider", "Save Provider", "Edit Provider"
  - Counts: "X provider(s)", "No providers found", "Providers & Staff" (section headers in profile)

## Common Gotchas
- The `degree` and `title` columns were added later (PRs #15-16) — always include them in inserts
- `practice_email` lives on `practice_locations` table, NOT on `practices`
- Contact note times are stored as `[HH:MM]` prefix in the notes text, parsed on display
- Reminder dates are stored as ISO date strings in `reminder_date` column on `contact_logs`
- County is guessed from city name via `guessCounty()` helper (Miami-Dade, Broward, Palm Beach)
- **JS template literals**: When editing HTML-generating template literals in views.js/nav.js, keep the entire string as a single contiguous template literal. Breaking it across lines with raw HTML outside the backtick string causes a JS syntax error. The whole `html += \`...\`` must be one unbroken string.
- **Merge conflicts when branch is behind main**: If a PR shows "not mergeable", the `claude/` branch has fallen behind. Fix: `git fetch origin main && git merge origin/main --no-edit`, resolve any conflicts (keep HEAD/our version), commit, re-push, then retry the merge API call.

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

### Git Environment — FULLY WORKING (updated 2026-02-21, confirmed working through PR #49)
1. **Push access**: ONLY `claude/*` branches work via git. Pushing to `main` returns 403. Do not attempt it.
2. **`gh` CLI**: NOT installed (command not found). Do not attempt any `gh` commands.
3. **GitHub REST API**: Works via `curl` to `https://api.github.com` with PAT token. Use this for PR creation and merge.
4. **GitHub PAT**: Fine-grained token scoped to WoundCareCRM repo. Stored in `~/.github_pat` (not in git). Read it with `cat ~/.github_pat`.
5. **Remote URL**: Set with PAT embedded: `git remote set-url origin https://$(cat ~/.github_pat)@github.com/TommieC25/WoundCareCRM.git`

### What TO Do for Git (full autonomous workflow)
1. Read PAT: `PAT=$(cat ~/.github_pat)`
2. Set remote: `git remote set-url origin https://$PAT@github.com/TommieC25/WoundCareCRM.git`
3. Commit and push to `claude/` branch
4. Create PR: `curl -X POST -H "Authorization: Bearer $PAT" https://api.github.com/repos/TommieC25/WoundCareCRM/pulls -d '{"title":"...","body":"...","head":"claude/...","base":"main"}'`
5. Merge PR: `curl -X PUT -H "Authorization: Bearer $PAT" https://api.github.com/repos/TommieC25/WoundCareCRM/pulls/<number>/merge -d '{"merge_method":"squash"}'`
- Full end-to-end autonomous — no manual steps needed from Tom.

### Session Handoff Checklist
When picking up from a compacted/previous conversation:
1. Read `CLAUDE.md` (this file) first
2. Run `git log --oneline -10` and `git branch -a` to understand current state
3. Check `git diff --stat origin/main...HEAD` to see what's pending
4. Do the actual work requested — don't re-explore known constraints
5. When providing code for Tom to copy-paste (e.g., Apps Script), output it as a **plain code block** — never use `<details>` collapse tags (they don't render on iPad)

### Output Rules for Tom (iPad User)
- No `<details>` / `<summary>` HTML tags — they collapse and can't be expanded on iPad
- No "see above" references — always include the actual content inline
- Keep code blocks plain and complete — Tom needs to select-all and copy
- **For ANY manual step (e.g. Apps Script, Google Sheets): always provide the COMPLETE file/code to paste — never diffs, never "find line X and replace" instructions. Partial instructions waste Tom's time and credits. Lead with the full paste-ready content immediately.**
