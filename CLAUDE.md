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
- Views: physicians list, practices list, activity log, map, dashboard
- Routing export tracks export history in localStorage to show NEW vs previously exported rows

## CSV Import Format
Expects columns: first_name, last_name, email, priority, specialty, degree, title, proj_vol (or patient_volume for backward compat), academic_connection/um_connection, general_notes, practice_name, address, city, zip, phone, fax

## Export Formats
- **Physicians CSV**: All physicians with practice info, degree, last contact, Status (latest activity)
- **Contact Logs CSV**: All activity with dates, locations, notes
- **Practices CSV**: All locations with details
- **Field Routing CSV**: Matches Google Sheet "Routing(Field Use)" tab — includes Status column with latest activity per physician

## Naming Conventions
- "Academic Connection" (UI label) = `academic_connection` column (formerly `um_connection`, still falls back to it)
- "Projected Volume" (UI) = `proj_vol` column (falls back to `mohs_volume`; formerly `patient_volume`)
- Priority 1-5 = Tier system (1 = highest)

## Common Gotchas
- The `degree` and `title` columns were added later (PRs #15-16) — always include them in inserts
- `practice_email` lives on `practice_locations` table, NOT on `practices`
- Contact note times are stored as `[HH:MM]` prefix in the notes text, parsed on display
- Reminder dates are stored as ISO date strings in `reminder_date` column on `contact_logs`
- County is guessed from city name via `guessCounty()` helper (Miami-Dade, Broward, Palm Beach)

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

### Git Environment Constraints (KNOWN — do NOT re-discover)
1. **Push access**: ONLY `claude/*` branches work. Pushing to `main` returns **403**. Do not attempt it.
2. **`gh` CLI**: Installed but has **NO authentication credentials**. Do not attempt `gh pr create`, `gh auth login`, or any `gh` command — they will all fail.
3. **GitHub REST API**: The local git proxy at `127.0.0.1` only handles git protocol (`/git/...` paths). It does **NOT** expose the GitHub REST API. Do not attempt `curl` to create PRs, list issues, or any GitHub API endpoint through the proxy.
4. **No GitHub token**: There is no `GITHUB_TOKEN`, `GH_TOKEN`, or any GitHub API credential in the environment. Do not search for one (env vars, file descriptors, `.netrc`, credential helpers — none exist).
5. **PR creation is impossible in this environment**. Accept this and move on. Tell Tom the branch is pushed and give him the compare URL: `https://github.com/TommieC25/WoundCareCRM/compare/main...<branch-name>`

### What TO Do for Git
- Commit and push to the assigned `claude/` branch — this works fine
- If a PR merge is needed: tell Tom the branch is pushed, provide the compare URL, and move on
- Do NOT waste credits trying workarounds (proxy paths, token hunting, `gh` auth, API calls)

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
