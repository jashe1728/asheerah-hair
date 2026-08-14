/**
 * Asheerah Hair — Google Apps Script backend
 * Deploy as a Web App (execute as the OWNER account, access = Anyone).
 * The static site POSTs orders here; they land in a Google Sheet Asheerah can open.
 *
 * FIXED 2026-08-14: the spreadsheet is now resolved ONCE via Script Properties and
 * reused on every call. Previously each call created a NEW spreadsheet whenever the
 * script ran standalone (getActiveSpreadsheet() == null), so orders scattered.
 */

var SS_NAME = 'Asheerah Hair Orders';
var OWNER_EMAIL = 'asheerahhair@gmail.com';   // who receives the order email
var SHEET_NAME = 'Orders';
var MSG_SHEET_NAME = 'Messages';
var SS_ID_PROP = 'ASH_SS_ID';                  // Script Property storing the spreadsheet id

function doGet(e) {
  var data = getSheet_().getDataRange().getValues();
  return json_({ ok: true, count: data.length - 1, columns: data[0] || [] });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.type === 'order') {
      getSheet_().appendRow([new Date(), body.text || '', body.method || '', body.name || '', body.email || '']);
      try {
        MailApp.sendEmail({
          to: OWNER_EMAIL,
          subject: 'New Asheerah Hair Order ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
          body: body.text || 'Order received.'
        });
      } catch (mailErr) { /* mail optional — never fail the order on a mail issue */ }
      return json_({ ok: true, saved: true, emailed: true });
    }

    if (body.type === 'contact') {
      getMessagesSheet_().appendRow([new Date(), body.name || '', body.email || '', body.phone || '', body.comment || '']);
      return json_({ ok: true, saved: true });
    }

    return json_({ ok: false, error: 'Unknown type' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * Resolve ONE spreadsheet deterministically and cache its id in Script Properties,
 * so every invocation writes to the same sheet (works bound OR standalone).
 * Returns the Orders sheet within it.
 */
function getSheet_() {
  return ensureSheet_(SHEET_NAME, ['Timestamp', 'Order text', 'Payment method', 'Name', 'Email']);
}

/** Messages sheet (for the contact form) — same single spreadsheet. */
function getMessagesSheet_() {
  return ensureSheet_(MSG_SHEET_NAME, ['Timestamp', 'Name', 'Email', 'Phone', 'Comment']);
}

function ensureSheet_(sheetName, header) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#C9A24B').setFontColor('#FFFFFF');
  }
  return sheet;
}

/** Returns the single canonical spreadsheet, creating + remembering it on first use. */
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SS_ID_PROP);
  if (id) {
    var existing = SpreadsheetApp.openById(id);
    if (existing) return existing;
  }
  // No stored id yet: prefer a bound spreadsheet, else create one, then remember it.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) { ss = SpreadsheetApp.create(SS_NAME); }
  props.setProperty(SS_ID_PROP, ss.getId());
  return ss;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run this once in the editor to trigger MailApp authorization. */
function authMail() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(),
    'Asheerah Hair backend authorized',
    'MailApp is now authorized for the Asheerah Hair order backend.');
}
