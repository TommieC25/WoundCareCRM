/**
 * WoundCareCRM → Google Sheets Auto-Sync
 *
 * This Apps Script pulls Field Routing data directly from Supabase
 * and populates the active sheet. It runs:
 *   - On open (when anyone opens the spreadsheet)
 *   - Every hour (via time-driven trigger)
 *
 * PRESERVES: column widths and TH / TC manual-entry values across syncs.
 * Rows with no zip code are excluded (unroutable for field use).
 *
 * COLUMN ORDER:
 *   TH | TC | Target | AS? | Tier | Provider First Name | Provider Last Name |
 *   First Last | Degree | Status | Specialty | Facility (full name) |
 *   Address | City | Zip | Phone Number | Vol | County | Notes
 *
 *   TH    = Travis Horn  (manual entry, preserved across syncs)
 *   TC    = Tom Cobin    (manual entry, preserved across syncs)
 *   Target = Y if HCP is marked as Target in CRM, else blank
 *   AS?   = Y if Advanced Solution in CRM, else blank
 *   Tier  = Priority tier 1-5 from CRM
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
var SHEET_NAME = 'Routing(Field Use)';

// === HEADERS ===
// Indices:  0    1       2        3     4
var HEADERS = [
  'TH', 'TC', 'Target', 'AS?', 'Tier',
  'Provider First Name', 'Provider Last Name',
  'First Last', 'Degree', 'Status', 'Specialty',
  'Facility (full name)', 'Address', 'City', 'Zip', 'Phone Number',
  'Vol', 'County', 'Notes'
];
// Index reference (used in sort, filter, row-key restore):
//   0  TH             (manual)
//   1  TC             (manual)
//   2  Target         (auto: is_target)
//   3  AS?            (auto: advanced_solution)
//   4  Tier           (auto: priority 1-5)
//   5  Provider First Name
//   6  Provider Last Name
//   7  First Last
//   8  Degree
//   9  Status
//  10  Specialty
//  11  Facility (full name)
//  12  Address
//  13  City
//  14  Zip
//  15  Phone Number
//  16  Vol
//  17  County
//  18  Notes

// Manual-entry columns preserved across syncs (TH, TC)
var MANUAL_COLS = [0, 1];

// === TRIGGERS ===

function installTriggers() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('syncFieldRouting')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onOpen()
    .create();
  ScriptApp.newTrigger('syncFieldRouting')
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log('Triggers installed: onOpen + every 15 minutes');
  SpreadsheetApp.getUi().alert('Triggers installed successfully!\n\nThe sheet will now auto-refresh when opened and every 15 minutes.\n\nTo enable the "Sync Now" button in the CRM, deploy this script as a Web App\n(Deploy → New deployment → Web app → Execute as Me → Anyone).');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WoundCare CRM')
    .addItem('Refresh Now', 'syncFieldRouting')
    .addItem('Reinstall Triggers', 'installTriggers')
    .addToUi();
}

// === WEB APP ENDPOINT ===
// Deploy as Web App (Execute as: Me, Who has access: Anyone) to enable the
// "Sync Now" button in the CRM.  The CRM calls this URL via a simple GET
// request to trigger an immediate sync without needing to open the sheet.
function doGet(e) {
  try {
    syncFieldRouting();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, ts: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// === MAIN SYNC FUNCTION ===

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

  // Read existing manual-entry columns (TH, TC) before overwriting
  var existingManualData = readManualColumns_(sheet);

  // Fetch data from Supabase
  var physicians = supaFetch_('providers', 'order=last_name.asc');
  var practices = supaFetch_('practices', 'order=name.asc');
  var locations = supaFetch_('practice_locations', 'select=*,practices(name)&order=city.asc');
  var assignments = supaFetch_('provider_location_assignments', 'select=*,practice_locations(*,practices(name))');
  var contactLogs = supaFetch_('contact_logs', 'select=*&order=contact_date.desc');

  // Build latest activity per provider
  var latestActivity = {};
  for (var i = 0; i < contactLogs.length; i++) {
    var log = contactLogs[i];
    if (!latestActivity[log.provider_id]) {
      latestActivity[log.provider_id] = log;
    }
  }

  // Build assignment map: provider_id → [assignments]
  var assignMap = {};
  for (var i = 0; i < assignments.length; i++) {
    var a = assignments[i];
    if (!assignMap[a.provider_id]) assignMap[a.provider_id] = [];
    assignMap[a.provider_id].push(a);
  }

  // Build practice map
  var practiceMap = {};
  for (var i = 0; i < practices.length; i++) {
    practiceMap[practices[i].id] = practices[i];
  }

  // Build location map
  var locationMap = {};
  for (var i = 0; i < locations.length; i++) {
    locationMap[locations[i].id] = locations[i];
  }

  // Build rows
  var rows = [];
  var assignedLocIds = {};

  // 1. Provider-location rows
  for (var pi = 0; pi < physicians.length; pi++) {
    var phys = physicians[pi];
    var assigns = assignMap[phys.id] || [];
    var activity = latestActivity[phys.id] || null;

    if (assigns.length === 0) {
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

  // FILTER: exclude rows with no zip code (unroutable for field use)
  rows = rows.filter(function(row) {
    var zip = String(row[14] || '').trim(); // index 14 = Zip
    return zip !== '' && zip !== '0';
  });

  // Restore TH / TC manual-entry columns from previous data
  rows = restoreManualColumns_(rows, existingManualData);

  // Sort: Zip asc, Address asc, Vol desc — field routing order
  rows.sort(function(a, b) {
    var zipA = String(a[14] || ''), zipB = String(b[14] || ''); // Zip = idx 14
    if (zipA !== zipB) return zipA < zipB ? -1 : 1;
    var addrA = String(a[12] || '').toLowerCase(), addrB = String(b[12] || '').toLowerCase(); // Address = idx 12
    if (addrA !== addrB) return addrA < addrB ? -1 : 1;
    var volA = Number(a[16]) || 0, volB = Number(b[16]) || 0; // Vol = idx 16
    return volB - volA;
  });

  // --- Write to sheet IN-PLACE ---

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }

  // Clear leftover rows from a previous larger dataset
  var lastRow = sheet.getLastRow();
  var dataEndRow = rows.length + 1;
  if (lastRow > dataEndRow) {
    sheet.getRange(dataEndRow + 1, 1, lastRow - dataEndRow, HEADERS.length).clearContent();
  }

  // Clear leftover columns
  var lastCol = sheet.getLastColumn();
  if (lastCol > HEADERS.length) {
    sheet.getRange(1, HEADERS.length + 1, Math.max(lastRow, 1), lastCol - HEADERS.length).clearContent();
  }

  // Last-synced timestamp
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  sheet.getRange(rows.length + 3, 1).setValue('Last synced: ' + timestamp);
  sheet.getRange(rows.length + 3, 1).setFontColor('#999999').setFontSize(9);

  // Restore column widths
  for (var w = 0; w < savedWidths.length && w < HEADERS.length; w++) {
    if (savedWidths[w] > 0) {
      sheet.setColumnWidth(w + 1, savedWidths[w]);
    }
  }

  Logger.log('Synced ' + rows.length + ' rows at ' + timestamp);
}

// === ROW BUILDER ===

function buildRow_(phys, loc, practice, activity, type) {
  var practiceName = '';
  if (practice && practice.name) {
    practiceName = practice.name;
  } else if (loc && loc.practices && loc.practices.name) {
    practiceName = loc.practices.name;
  }

  var status = '';
  if (activity) {
    var note = (activity.notes || '').replace(/^\[\d{1,2}:\d{2}\]\s*/, '');
    var preview = note.length > 80 ? note.substring(0, 80) + '...' : note;
    status = activity.contact_date + ': ' + preview;
  }

  if (type === 'loc-only') {
    return [
      '', '',                                             // TH, TC (manual)
      '', '',                                             // Target, AS?
      '',                                                 // Tier
      '(Enter HCP first name)', '(Enter HCP last name)', // First, Last
      '', '',                                             // First Last, Degree
      status, '',                                         // Status, Specialty
      practiceName,                                       // Facility
      loc ? loc.address || '' : '',                       // Address
      loc ? loc.city || '' : '',                          // City
      loc ? loc.zip || '' : '',                           // Zip
      fmtPhone_(loc ? loc.phone : ''),                    // Phone
      '',                                                 // Vol
      loc ? countyFromZip_(loc.zip) || guessCounty_(loc.city) : '',  // County
      loc && loc.practice_email ? 'Email: ' + loc.practice_email : '' // Notes
    ];
  }

  var firstName  = phys ? phys.first_name || '' : '';
  var lastName   = phys ? phys.last_name  || '' : '';
  var firstLast  = (firstName + ' ' + lastName).trim();
  var degree     = phys ? phys.degree   || '' : '';
  var tier       = phys ? normPriority_(phys.priority) : '';
  var specialty  = phys ? phys.specialty || '' : '';
  var county     = (loc ? countyFromZip_(loc.zip) || guessCounty_(loc.city) : '');
  var notes      = phys ? phys.general_notes || '' : '';
  var asVal      = phys && phys.advanced_solution ? 'Y' : '';
  var targetVal  = phys && phys.is_target ? 'Y' : '';

  // Guard against corrupt non-numeric vol values (e.g. text accidentally saved to proj_vol)
  var rawVol = phys ? (phys.proj_vol || phys.mohs_volume || '') : '';
  var vol = (rawVol !== '' && !isNaN(Number(String(rawVol)))) ? rawVol : '';

  return [
    '',                              // TH (manual)
    '',                              // TC (manual)
    targetVal,                       // Target
    asVal,                           // AS?
    tier,                            // Tier
    firstName,                       // Provider First Name
    lastName,                        // Provider Last Name
    firstLast,                       // First Last
    degree,                          // Degree
    status,                          // Status
    specialty,                       // Specialty
    practiceName,                    // Facility (full name)
    loc ? loc.address || '' : '',    // Address
    loc ? loc.city    || '' : '',    // City
    loc ? loc.zip     || '' : '',    // Zip
    fmtPhone_(loc ? loc.phone : ''), // Phone Number
    vol,                             // Vol
    county,                          // County
    notes                            // Notes
  ];
}

// === PRESERVE MANUAL COLUMNS (TH, TC) ===
// Matched by "First Last" + "Facility (full name)" key across syncs.
// Also accepts old column names ORIG/CALL so any legacy data migrates on first sync.

function readManualColumns_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return {};
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var manual = {};

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colFirstLast = indexOf_(headers, 'First Last');
  var colFacility  = indexOf_(headers, 'Facility (full name)');

  // Accept new names (TH/TC) or legacy names (ORIG/CALL) — whichever is present
  var colTH = indexOf_(headers, 'TH');
  if (colTH < 0) colTH = indexOf_(headers, 'ORIG');   // legacy migration

  var colTC = indexOf_(headers, 'TC');
  if (colTC < 0) colTC = indexOf_(headers, 'CALL');   // legacy migration

  if (colFirstLast < 0 || colFacility < 0) return {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var key = makeRowKey_(row[colFirstLast], row[colFacility]);
    if (key) {
      manual[key] = {
        th: colTH >= 0 ? row[colTH] : '',
        tc: colTC >= 0 ? row[colTC] : ''
      };
    }
  }
  return manual;
}

function restoreManualColumns_(rows, manual) {
  for (var i = 0; i < rows.length; i++) {
    var key = makeRowKey_(rows[i][7], rows[i][11]); // First Last = idx 7, Facility = idx 11
    if (key && manual[key]) {
      rows[i][0] = manual[key].th || ''; // TH
      rows[i][1] = manual[key].tc || ''; // TC
    }
  }
  return rows;
}

function makeRowKey_(firstLast, facility) {
  var fl  = String(firstLast || '').trim().toLowerCase();
  var fac = String(facility  || '').trim().toLowerCase();
  if (!fl && !fac) return '';
  return fl + '|||' + fac;
}

function indexOf_(arr, val) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === val) return i;
  }
  return -1;
}

// === TIER NORMALIZER ===
// Handles legacy "TIER 3 - MODERATE", "P3", plain "3", etc.
// Returns the numeric digit as-is from the profile — no clamping.

function normPriority_(val) {
  if (!val && val !== 0) return '';
  var m = String(val).match(/(\d)/);
  return m ? m[1] : '';
}

// === PHONE FORMAT HELPER ===

function fmtPhone_(p) {
  if (!p) return '';
  var d = String(p).replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.substring(1);
  if (d.length === 10) return d.substring(0, 3) + '-' + d.substring(3, 6) + '-' + d.substring(6);
  return p;
}

// === COUNTY LOOKUP — ZIP-BASED (primary) ===
// Uses actual South Florida zip code ranges for accurate county assignment.
// Covers every routable zip in Miami-Dade, Broward, and Palm Beach counties.
// Falls back to guessCounty_() (city-name matching) if zip is unrecognized.

function countyFromZip_(zip) {
  if (!zip) return '';
  var z = parseInt(String(zip).replace(/\D/g, ''), 10);
  if (isNaN(z)) return '';

  // --- Broward County ---
  if (z === 33004 || z === 33009) return 'Broward';        // Dania Beach, Hallandale Beach
  if (z >= 33019 && z <= 33029) return 'Broward';          // Hollywood, Pembroke Pines, Miramar
  if (z >= 33060 && z <= 33076) return 'Broward';          // Pompano Beach, Deerfield Beach,
                                                            //   Lighthouse Point, Coconut Creek,
                                                            //   Coral Springs, Margate, Tamarac
  if (z >= 33301 && z <= 33340) return 'Broward';          // Fort Lauderdale, Davie, Plantation,
                                                            //   Sunrise, Oakland Park, Wilton Manors
  if (z === 33388) return 'Broward';                        // Plantation PO Box
  if (z === 33441 || z === 33442) return 'Broward';        // Deerfield Beach (extra zip blocks)

  // --- Palm Beach County ---
  if (z >= 33401 && z <= 33499) return 'Palm Beach';       // West Palm Beach, Boca Raton,
                                                            //   Boynton Beach, Delray Beach,
                                                            //   Palm Beach Gardens, Jupiter,
                                                            //   Lake Worth, Wellington, Royal Palm Bch

  // --- Miami-Dade County ---
  if (z >= 33010 && z <= 33018) return 'Miami-Dade';       // Hialeah
  if (z >= 33030 && z <= 33039) return 'Miami-Dade';       // Homestead, Florida City, Key Largo area
  if (z >= 33054 && z <= 33056) return 'Miami-Dade';       // Miami Gardens, Opa-locka
  if (z >= 33101 && z <= 33299) return 'Miami-Dade';       // Miami, Miami Beach, Coral Gables,
                                                            //   South Miami, Pinecrest, Palmetto Bay,
                                                            //   Cutler Bay, Doral, Sweetwater,
                                                            //   Aventura, Sunny Isles, North Miami

  return '';
}

// === COUNTY HELPER — CITY-BASED (fallback) ===

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
