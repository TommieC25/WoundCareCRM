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
| `physicians` | HCPs — first_name, last_name, degree, title, email, specialty, priority (1-5 tier), academic_connection, patient_volume, general_notes, last_contact |
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
Expects columns: first_name, last_name, email, priority, specialty, degree, title, patient_volume, academic_connection/um_connection, general_notes, practice_name, address, city, zip, phone, fax

## Export Formats
- **Physicians CSV**: All physicians with practice info, degree, last contact, Status (latest activity)
- **Contact Logs CSV**: All activity with dates, locations, notes
- **Practices CSV**: All locations with details
- **Field Routing CSV**: Matches Google Sheet "Routing(Field Use)" tab — includes Status column with latest activity per physician

## Naming Conventions
- "Academic Connection" (UI label) = `academic_connection` column (formerly `um_connection`, still falls back to it)
- "Candidate Patient Volume" (UI) = `patient_volume` column (falls back to `mohs_volume`)
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
- Manual-entry columns (ORIG, CALL, AS?, Duplicate?) are preserved across syncs
