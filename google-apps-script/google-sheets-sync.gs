/**
 * WoundCareCRM → Google Sheets Auto-Sync (v2)
 *
 * This Apps Script pulls Field Routing data directly from Supabase
 * and populates the active sheet. It runs:
 *   - On open (when anyone opens the spreadsheet)
 *   - Every hour (via time-driven trigger)
 *
 * PRESERVES: column widths, formatting, sort order, filter views.
 * Only cell values in the data range are updated.
 *
 * 15-COLUMN LAYOUT:
 *   CALL | AS? | Vol | Rank | First Last | Degree | Status | Specialty |
 *   Facility (full name) | Address | City | Zip | Phone Number | County | Notes
 *
 * TIP: Use Data → Filter Views to create a persistent custom sort.
 *      Filter Views survive data refreshes automatically.
 *
 * SETUP:
 *   1. Open your Google Sheet
 *   2. Extensions → Apps Script
 *   3. Paste this entire file into the script editor
 *   4. Click the disk icon to save
 *   5. Run "installTriggers" once from the Run menu (grant permissions when prompted)
 *   6. Done! The sheet will auto-refresh on open and hourly.
 */

// === CONFIG ===
var SUPABASE_URL = 'https://xhdjywibdjzbczfjmctp.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoZGp5d2liZGp6YmN6ZmptY3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NzE4MTYsImV4cCI6MjA4NTM0NzgxNn0.vHAfeYTVbu2Isu5AoFONvzrtJ2sS3YwF00QRe3LNrbU';
var SHEET_NAME = 'Routing(Field Use)'; // Name of the tab to write to

// === HEADERS (15 columns) ===
var HEADERS = [
  'CALL','AS?','Vol','Rank','First Last','Degree',
  'Status','Specialty','Facility (full name)','Address',
  'City','Zip','Phone Number','County','Notes'
];

// Manual-entry column indices (preserved across syncs)
var MANUAL_COLS = [0]; // CALL

// === TRIGGERS ===

/**
 * Run this ONCE to install the onOpen and hourly triggers.
 * Go to Run → installTriggers in the Apps Script editor.
 */
function installTriggers() {
  // Remove any existing triggers from this project to avoid duplicates
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    ScriptApp.deleteTrigger(existing[i]);
  }
  // Trigger on spreadsheet open
  ScriptApp.newTrigger('syncFieldRouting')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onOpen()
    .create();
  // Trigger every hour
  ScriptApp.newTrigger('syncFieldRouting')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Triggers installed: onOpen + hourly');
  SpreadsheetApp.getUi().alert('Triggers installed successfully!\n\nThe sheet will now auto-refresh when opened and every hour.');
}

/**
 * Simple onOpen menu for manual refresh
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WoundCare CRM')
    .addItem('Refresh Now', 'syncFieldRouting')
    .addItem('Reinstall Triggers', 'installTriggers')
    .addToUi();
}

// === MAIN SYNC FUNCTION ===

/**
 * Fetches all data from Supabase and updates the Field Routing sheet.
 * Writes data in-place — does NOT clear the sheet, so column widths,
 * formatting, and filter views are preserved.
 * Preserves values in CALL column (manual-entry column).
 * AS? column is populated from CRM data (advanced_solution field).
 */
function syncFieldRouting() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Save current column widths before sync
  var savedWidths = [];
  var maxCol = Math.max(sheet.getLastColumn(), HEADERS.length);
  for (var w = 1; w <= maxCol; w++) {
    savedWidths.push(sheet.getColumnWidth(w));
  }

  // Read existing manual-entry columns before overwriting
  var existingManualData = readManualColumns_(sheet);

  // Fetch data from Supabase
  var physicians = supaFetch_('physicians', 'order=last_name.asc');
  var practices = supaFetch_('practices', 'order=name.asc');
  var locations = supaFetch_('practice_locations', 'select=*,practices(name)&order=city.asc');
  var assignments = supaFetch_('physician_location_assignments', 'select=*,practice_locations(*,practices(name))');
  var contactLogs = supaFetch_('contact_logs', 'select=*&order=contact_date.desc');

  // Build latest activity per physician
  var latestActivity = {};
  for (var i = 0; i < contactLogs.length; i++) {
    var log = contactLogs[i];
    if (!latestActivity[log.physician_id]) {
      latestActivity[log.physician_id] = log;
    }
  }

  // Build assignment map: physician_id → [assignments]
  var assignMap = {};
  for (var i = 0; i < assignments.length; i++) {
    var a = assignments[i];
    if (!assignMap[a.physician_id]) assignMap[a.physician_id] = [];
    assignMap[a.physician_id].push(a);
  }

  // Build practice map for quick lookup
  var practiceMap = {};
  for (var i = 0; i < practices.length; i++) {
    practiceMap[practices[i].id] = practices[i];
  }

  // Build location map for quick lookup
  var locationMap = {};
  for (var i = 0; i < locations.length; i++) {
    locationMap[locations[i].id] = locations[i];
  }

  // Build rows
  var rows = [];
  var assignedLocIds = {};

  // 1. Physician-location rows
  for (var pi = 0; pi < physicians.length; pi++) {
    var phys = physicians[pi];
    var assigns = assignMap[phys.id] || [];
    var activity = latestActivity[phys.id] || null;

    if (assigns.length === 0) {
      // Physician with no location
      rows.push(buildRow_(phys, null, null, activity, 'phys-only'));
    } else {
      for (var ai = 0; ai < assigns.length; ai++) {
        var a = assigns[ai];
        var loc = a.practice_locations || locationMap[a.practice_location_id];
        if (!loc) continue;
        assignedLocIds[loc.id] = true;
        var practice = practiceMap[loc.practice_id] || null;
        rows.push(buildRow_(phys, loc, practice, activity, 'phys-loc'));
      }
    }
  }

  // 2. Practice locations with NO assigned physicians
  for (var li = 0; li < locations.length; li++) {
    var loc = locations[li];
    if (assignedLocIds[loc.id]) continue;
    var practice = practiceMap[loc.practice_id] || null;
    rows.push(buildRow_(null, loc, practice, null, 'loc-only'));
  }

  // Restore manual-entry columns from previous data
  rows = restoreManualColumns_(rows, existingManualData);

  // Sort rows: Zip (idx 11, asc), Address (idx 9, asc), Vol (idx 2, desc)
  rows.sort(function(a, b) {
    var zipA = String(a[11] || ''), zipB = String(b[11] || '');
    if (zipA !== zipB) return zipA < zipB ? -1 : 1;
    var addrA = String(a[9] || '').toLowerCase(), addrB = String(b[9] || '').toLowerCase();
    if (addrA !== addrB) return addrA < addrB ? -1 : 1;
    var volA = Number(a[2]) || 0, volB = Number(b[2]) || 0;
    return volB - volA; // descending
  });

  // --- Write to sheet IN-PLACE (no clearContents, preserves formatting) ---

  // Write headers (row 1)
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');

  // Write data rows (overwrite in-place)
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }

  // Clear any leftover rows from a previous larger dataset
  var lastRow = sheet.getLastRow();
  var dataEndRow = rows.length + 1; // row 1 = headers
  if (lastRow > dataEndRow) {
    sheet.getRange(dataEndRow + 1, 1, lastRow - dataEndRow, HEADERS.length).clearContent();
  }

  // Clear any leftover columns if the sheet previously had more columns
  var lastCol = sheet.getLastColumn();
  if (lastCol > HEADERS.length) {
    sheet.getRange(1, HEADERS.length + 1, lastRow, lastCol - HEADERS.length).clearContent();
  }

  // Add last-synced timestamp
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  sheet.getRange(rows.length + 3, 1).setValue('Last synced: ' + timestamp);
  sheet.getRange(rows.length + 3, 1).setFontColor('#999999').setFontSize(9);

  // Restore column widths to exactly what they were before sync
  for (var w = 0; w < savedWidths.length && w < HEADERS.length; w++) {
    if (savedWidths[w] > 0) {
      sheet.setColumnWidth(w + 1, savedWidths[w]);
    }
  }

  Logger.log('Synced ' + rows.length + ' rows at ' + timestamp);
}

// === ROW BUILDER (15-element array) ===

function buildRow_(phys, loc, practice, activity, type) {
  var practiceName = '';
  if (practice && practice.name) {
    practiceName = practice.name;
  } else if (loc && loc.practices && loc.practices.name) {
    practiceName = loc.practices.name;
  }

  // Status from latest activity
  var status = '';
  if (activity) {
    var note = (activity.notes || '').replace(/^\[\d{1,2}:\d{2}\]\s*/, '');
    var preview = note.length > 80 ? note.substring(0, 80) + '...' : note;
    status = activity.contact_date + ': ' + preview;
  }

  if (type === 'loc-only') {
    return [
      '',                                                 // CALL (manual)
      '',                                                 // AS?
      '',                                                 // Vol
      '',                                                 // Rank
      '',                                                 // First Last
      '',                                                 // Degree
      status,                                             // Status
      '',                                                 // Specialty
      practiceName,                                       // Facility (full name)
      loc ? loc.address || '' : '',                       // Address
      loc ? loc.city || '' : '',                          // City
      loc ? loc.zip || '' : '',                           // Zip
      fmtPhone_(loc ? loc.phone : ''),                    // Phone Number
      loc && loc.city ? guessCounty_(loc.city) : '',     // County
      loc && loc.practice_email ? 'Email: ' + loc.practice_email : '' // Notes
    ];
  }

  var firstName = phys ? phys.first_name || '' : '';
  var lastName = phys ? phys.last_name || '' : '';
  var firstLast = (firstName + ' ' + lastName).trim();
  var degree = phys ? phys.degree || '' : '';
  var rank = phys ? phys.priority || '' : '';
  var specialty = phys ? phys.specialty || '' : '';
  var vol = phys ? (phys.patient_volume || phys.mohs_volume || '') : '';
  var county = loc && loc.city ? guessCounty_(loc.city) : '';
  var notes = phys ? phys.general_notes || '' : '';
  var asVal = phys && phys.advanced_solution ? 'Y' : '';

  return [
    '',                             // CALL (manual)
    asVal,                          // AS?
    vol,                            // Vol
    rank,                           // Rank
    firstLast,                      // First Last
    degree,                         // Degree
    status,                         // Status
    specialty,                      // Specialty
    practiceName,                   // Facility (full name)
    loc ? loc.address || '' : '',   // Address
    loc ? loc.city || '' : '',      // City
    loc ? loc.zip || '' : '',       // Zip
    fmtPhone_(loc ? loc.phone : ''), // Phone Number
    county,                         // County
    notes                           // Notes
  ];
}

// === PRESERVE MANUAL COLUMNS ===
// CALL (col 0) is manual-entry.
// We match rows by "First Last" + "Facility" to restore these values after sync.

function readManualColumns_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return {};
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var manual = {};

  // Find column indices dynamically from header row
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colFirstLast = indexOf_(headers, 'First Last');
  var colFacility = indexOf_(headers, 'Facility (full name)');
  var colCall = indexOf_(headers, 'CALL');

  if (colFirstLast < 0 || colFacility < 0) return {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var key = makeRowKey_(row[colFirstLast], row[colFacility]);
    if (key) {
      manual[key] = {
        call: colCall >= 0 ? row[colCall] : ''
      };
    }
  }
  return manual;
}

function restoreManualColumns_(rows, manual) {
  for (var i = 0; i < rows.length; i++) {
    var key = makeRowKey_(rows[i][4], rows[i][8]); // First Last (idx 4) + Facility (idx 8)
    if (key && manual[key]) {
      rows[i][0] = manual[key].call || '';  // CALL
    }
  }
  return rows;
}

function makeRowKey_(firstLast, facility) {
  var fl = String(firstLast || '').trim().toLowerCase();
  var fac = String(facility || '').trim().toLowerCase();
  if (!fl && !fac) return '';
  return fl + '|||' + fac;
}

function indexOf_(arr, val) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === val) return i;
  }
  return -1;
}

// === PHONE FORMAT HELPER ===

function fmtPhone_(p) {
  if (!p) return '';
  var d = String(p).replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.substring(1);
  if (d.length === 10) return d.substring(0, 3) + '-' + d.substring(3, 6) + '-' + d.substring(6);
  return p;
}

// === COUNTY HELPER (mirrors CRM guessCounty) ===

function guessCounty_(city) {
  if (!city) return '';
  var c = city.toLowerCase();
  var mdCities = ['miami','hialeah','homestead','key biscayne','coral gables','south miami','palmetto bay','doral','north miami','aventura','miami beach','miami gardens','miami lakes','opa-locka','sunny isles','key largo'];
  var brCities = ['fort lauderdale','hollywood','pembroke pines','coral springs','deerfield beach','plantation','davie','weston','tamarac','lauderdale lakes','coconut creek','pompano beach','cooper city'];
  var pbCities = ['west palm beach','boca raton','boynton beach','delray beach','palm beach gardens','jupiter','lake worth','wellington','royal palm beach','belle glade','palm city','atlantis','north palm beach'];
  for (var i = 0; i < mdCities.length; i++) { if (c.indexOf(mdCities[i]) >= 0) return 'Miami-Dade'; }
  for (var i = 0; i < brCities.length; i++) { if (c.indexOf(brCities[i]) >= 0) return 'Broward'; }
  for (var i = 0; i < pbCities.length; i++) { if (c.indexOf(pbCities[i]) >= 0) return 'Palm Beach'; }
  return '';
}

// === SUPABASE API HELPER ===

function supaFetch_(table, queryParams) {
  var url = SUPABASE_URL + '/rest/v1/' + table + '?' + (queryParams || '');
  var options = {
    method: 'get',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code !== 200) {
    Logger.log('Supabase error (' + code + ') for ' + table + ': ' + response.getContentText());
    return [];
  }
  return JSON.parse(response.getContentText());
}
