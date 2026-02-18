/**
 * WoundCareCRM Google Sheets Sync Script
 *
 * SETUP INSTRUCTIONS:
 * 1. Open Google Sheets (sheets.google.com) on your MacBook
 * 2. Create a new spreadsheet (or open existing)
 * 3. Go to Extensions > Apps Script
 * 4. Delete any existing code and paste this entire script
 * 5. Click Save (disk icon)
 * 6. Update SUPABASE_URL and SUPABASE_ANON_KEY below with your credentials
 * 7. Run > Run function > initialSetup (first time only)
 * 8. Use the custom menu "CRM Sync" that appears in your Sheet
 */

// ====================
// CONFIGURATION
// ====================
const SUPABASE_URL = 'https://xhdjywibdjzbczfjmctp.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE'; // Get from Supabase dashboard > Settings > API

// Column mapping (A=1, B=2, etc.) - matches your requested order
const COLUMNS = {
  CALL: 1,           // A - Checkbox for call tracking
  RANK: 2,           // B - Overall rank
  VOL: 3,            // C - Volume score
  FIRST_NAME: 4,     // D - First name (will be hidden)
  LAST_NAME: 5,      // E - Last name
  SPECIALTY: 6,      // F - Specialty
  STATUS: 7,         // G - Call status
  FACILITY: 8,       // H - Facility full name
  ADDRESS: 9,        // I - Street address
  CITY: 10,          // J - City
  ZIP: 11,           // K - Zip code
  PHONE: 12,         // L - Phone number
  COUNTY: 13,        // M - County
  NOTES: 14          // N - Notes
};

// Status dropdown options
const STATUS_OPTIONS = [
  'Not Contacted',
  'Left Message',
  'Scheduled',
  'Met - Interested',
  'Met - Follow Up',
  'Met - Not Interested',
  'No Answer',
  'Wrong Number',
  'Do Not Contact'
];

// ====================
// MENU & SETUP
// ====================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('CRM Sync')
    .addItem('Pull Data from CRM', 'pullFromCRM')
    .addItem('Push Changes to CRM', 'pushToCRM')
    .addSeparator()
    .addItem('Sync Both Ways', 'fullSync')
    .addSeparator()
    .addItem('Format Sheet', 'formatSheet')
    .addItem('Initial Setup', 'initialSetup')
    .addToUi();
}

function initialSetup() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Set headers
  const headers = [
    'CALL', 'Rank', 'Vol', 'Physician First Name', 'Physician Last Name',
    'Specialty', 'Status', 'Facility (full name)', 'Address', 'City',
    'Zip', 'Phone Number', 'County', 'Notes'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Format the sheet
  formatSheet();

  // Pull initial data
  pullFromCRM();

  SpreadsheetApp.getUi().alert('Setup complete! Your CRM data has been loaded.');
}

function formatSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = Math.max(sheet.getLastRow(), 2);

  // Header styling
  const headerRange = sheet.getRange(1, 1, 1, 14);
  headerRange.setBackground('#0a4d3c')
             .setFontColor('white')
             .setFontWeight('bold')
             .setHorizontalAlignment('center');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Column widths
  sheet.setColumnWidth(COLUMNS.CALL, 50);       // CALL - narrow checkbox
  sheet.setColumnWidth(COLUMNS.RANK, 50);       // Rank - narrow
  sheet.setColumnWidth(COLUMNS.VOL, 45);        // Vol - narrow
  sheet.setColumnWidth(COLUMNS.FIRST_NAME, 120); // First Name
  sheet.setColumnWidth(COLUMNS.LAST_NAME, 120);  // Last Name
  sheet.setColumnWidth(COLUMNS.SPECIALTY, 100);  // Specialty
  sheet.setColumnWidth(COLUMNS.STATUS, 130);     // Status
  sheet.setColumnWidth(COLUMNS.FACILITY, 280);   // Facility - wide
  sheet.setColumnWidth(COLUMNS.ADDRESS, 200);    // Address
  sheet.setColumnWidth(COLUMNS.CITY, 120);       // City
  sheet.setColumnWidth(COLUMNS.ZIP, 70);         // Zip
  sheet.setColumnWidth(COLUMNS.PHONE, 120);      // Phone
  sheet.setColumnWidth(COLUMNS.COUNTY, 100);     // County
  sheet.setColumnWidth(COLUMNS.NOTES, 300);      // Notes - wide

  // Hide First Name column (column D)
  sheet.hideColumn(sheet.getRange(1, COLUMNS.FIRST_NAME));

  // Add checkboxes to CALL column (skip header)
  if (lastRow > 1) {
    const callRange = sheet.getRange(2, COLUMNS.CALL, lastRow - 1, 1);
    callRange.insertCheckboxes();
  }

  // Add Status dropdown validation
  if (lastRow > 1) {
    const statusRange = sheet.getRange(2, COLUMNS.STATUS, lastRow - 1, 1);
    const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUS_OPTIONS)
      .setAllowInvalid(false)
      .build();
    statusRange.setDataValidation(statusRule);
  }

  // Conditional formatting for Status column
  const rules = sheet.getConditionalFormatRules();

  // Clear existing status rules
  const newRules = rules.filter(rule => {
    const ranges = rule.getRanges();
    return !ranges.some(r => r.getColumn() === COLUMNS.STATUS);
  });

  // Add status color rules
  const statusColors = {
    'Not Contacted': '#f3f4f6',      // Gray
    'Left Message': '#fef3c7',       // Yellow
    'Scheduled': '#dbeafe',          // Blue
    'Met - Interested': '#d1fae5',   // Green
    'Met - Follow Up': '#e0e7ff',    // Indigo
    'Met - Not Interested': '#fee2e2', // Red
    'No Answer': '#fed7aa',          // Orange
    'Wrong Number': '#fecaca',       // Light red
    'Do Not Contact': '#1f2937'      // Dark (with white text handled separately)
  };

  const statusColumn = sheet.getRange(2, COLUMNS.STATUS, 1000, 1);

  Object.entries(statusColors).forEach(([status, color]) => {
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(status)
      .setBackground(color)
      .setRanges([statusColumn])
      .build();
    newRules.push(rule);
  });

  sheet.setConditionalFormatRules(newRules);

  // Alternating row colors for readability
  const dataRange = sheet.getRange(2, 1, lastRow - 1, 14);
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
}

// ====================
// SUPABASE API HELPERS
// ====================

function supabaseRequest(endpoint, method, data) {
  const options = {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
    },
    muteHttpExceptions: true
  };

  if (data) {
    options.payload = JSON.stringify(data);
  }

  const response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + endpoint, options);
  const responseCode = response.getResponseCode();

  if (responseCode >= 400) {
    throw new Error('Supabase error: ' + response.getContentText());
  }

  const content = response.getContentText();
  return content ? JSON.parse(content) : null;
}

// ====================
// DATA SYNC FUNCTIONS
// ====================

function pullFromCRM() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const ui = SpreadsheetApp.getUi();

  try {
    // Fetch physicians with their practice location data
    const physicians = supabaseRequest('physicians?select=*', 'GET');
    const practices = supabaseRequest('practices?select=*', 'GET');
    const locations = supabaseRequest('practice_locations?select=*', 'GET');
    const assignments = supabaseRequest('physician_location_assignments?select=*', 'GET');
    const contactLogs = supabaseRequest('contact_logs?select=*&order=contact_date.desc', 'GET');

    // Build lookup maps
    const practiceMap = {};
    practices.forEach(p => practiceMap[p.id] = p);

    const locationMap = {};
    locations.forEach(l => locationMap[l.id] = l);

    // Get latest status for each physician from contact logs
    const physicianStatus = {};
    contactLogs.forEach(log => {
      if (!physicianStatus[log.physician_id]) {
        physicianStatus[log.physician_id] = log.notes || 'Not Contacted';
      }
    });

    // Build physician-location relationships
    const physicianLocations = {};
    assignments.forEach(a => {
      if (!physicianLocations[a.physician_id]) {
        physicianLocations[a.physician_id] = [];
      }
      if (locationMap[a.location_id]) {
        physicianLocations[a.physician_id].push(locationMap[a.location_id]);
      }
    });

    // Clear existing data (keep header)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 14).clear();
    }

    // Build rows
    const rows = [];
    physicians.forEach(physician => {
      const locs = physicianLocations[physician.id] || [];
      const primaryLoc = locs[0] || {};
      const practice = primaryLoc.practice_id ? practiceMap[primaryLoc.practice_id] : null;

      // Map priority to status if no contact log exists
      let status = physicianStatus[physician.id] || 'Not Contacted';

      rows.push([
        false,  // CALL checkbox (unchecked)
        physician.priority || '',  // Rank (using priority as proxy)
        '',     // Vol (volume_score not in current schema)
        physician.first_name || '',
        physician.last_name || '',
        physician.specialty || '',
        status,
        practice ? practice.name : (primaryLoc.name || ''),  // Facility name
        primaryLoc.address || '',
        primaryLoc.city || '',
        primaryLoc.zip || '',
        primaryLoc.phone || '',
        primaryLoc.county || '',
        physician.general_notes || ''
      ]);
    });

    // Sort by rank (priority)
    rows.sort((a, b) => {
      const rankA = parseInt(a[1]) || 999;
      const rankB = parseInt(b[1]) || 999;
      return rankA - rankB;
    });

    // Write to sheet
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 14).setValues(rows);
    }

    // Reapply formatting
    formatSheet();

    ui.alert('Success', 'Pulled ' + rows.length + ' physicians from CRM.', ui.ButtonSet.OK);

  } catch (error) {
    ui.alert('Error', 'Failed to pull data: ' + error.message, ui.ButtonSet.OK);
    console.error(error);
  }
}

function pushToCRM() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const ui = SpreadsheetApp.getUi();

  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      ui.alert('No data to push.');
      return;
    }

    const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
    let updated = 0;
    let errors = 0;

    // Get existing physicians to match by name
    const physicians = supabaseRequest('physicians?select=id,first_name,last_name', 'GET');
    const physicianMap = {};
    physicians.forEach(p => {
      const key = (p.first_name + '|' + p.last_name).toLowerCase();
      physicianMap[key] = p.id;
    });

    data.forEach((row, index) => {
      const firstName = row[COLUMNS.FIRST_NAME - 1];
      const lastName = row[COLUMNS.LAST_NAME - 1];
      const status = row[COLUMNS.STATUS - 1];
      const notes = row[COLUMNS.NOTES - 1];

      if (!firstName && !lastName) return;

      const key = (firstName + '|' + lastName).toLowerCase();
      const physicianId = physicianMap[key];

      if (physicianId) {
        try {
          // Update physician notes
          if (notes) {
            supabaseRequest(
              'physicians?id=eq.' + physicianId,
              'PATCH',
              { general_notes: notes }
            );
          }

          // Log status change as contact log
          if (status && status !== 'Not Contacted') {
            supabaseRequest('contact_logs', 'POST', {
              physician_id: physicianId,
              contact_date: new Date().toISOString(),
              notes: status,
              contact_method: 'Google Sheets Sync'
            });
          }

          updated++;
        } catch (e) {
          errors++;
          console.error('Error updating ' + firstName + ' ' + lastName + ': ' + e);
        }
      }
    });

    ui.alert('Sync Complete',
      'Updated: ' + updated + ' physicians\n' +
      'Errors: ' + errors,
      ui.ButtonSet.OK);

  } catch (error) {
    ui.alert('Error', 'Failed to push data: ' + error.message, ui.ButtonSet.OK);
    console.error(error);
  }
}

function fullSync() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Full Sync',
    'This will:\n1. Push your current changes to CRM\n2. Pull latest data from CRM\n\nContinue?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    pushToCRM();
    Utilities.sleep(1000);  // Brief pause
    pullFromCRM();
  }
}

// ====================
// UTILITY FUNCTIONS
// ====================

function getPhysicianByRow(rowNumber) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = sheet.getRange(rowNumber, 1, 1, 14).getValues()[0];

  return {
    call: row[0],
    rank: row[1],
    vol: row[2],
    firstName: row[3],
    lastName: row[4],
    specialty: row[5],
    status: row[6],
    facility: row[7],
    address: row[8],
    city: row[9],
    zip: row[10],
    phone: row[11],
    county: row[12],
    notes: row[13]
  };
}

// Quick dial - formats phone for click-to-call on mobile
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;

  // If CALL checkbox is checked, show phone number
  if (range.getColumn() === COLUMNS.CALL && range.getValue() === true) {
    const row = range.getRow();
    const phone = sheet.getRange(row, COLUMNS.PHONE).getValue();
    const name = sheet.getRange(row, COLUMNS.LAST_NAME).getValue();

    // Log the call attempt
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Call ' + name + ': ' + phone,
      'Phone',
      5
    );
  }
}

// ====================
// SCHEDULED SYNC (Optional)
// ====================

// To enable auto-sync every hour:
// 1. Go to Triggers (clock icon in Apps Script)
// 2. Add trigger: autoSync, Time-driven, Hour timer, Every hour
function autoSync() {
  try {
    pullFromCRM();
    console.log('Auto-sync completed at ' + new Date().toISOString());
  } catch (error) {
    console.error('Auto-sync failed: ' + error.message);
  }
}
