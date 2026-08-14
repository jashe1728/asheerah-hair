/**
 * Asheerah Hair — Google Apps Script backend
 * Deploy as a Web App (execute as the OWNER account, access = Anyone).
 * The static site POSTs orders here; they land in a Google Sheet Asheerah can open.
 * Pattern verified for Delícias da Jade (google-apps-script-backend skill).
 */

var SS_NAME = 'Asheerah Hair Orders';
var OWNER_EMAIL = 'asheerahhair@gmail.com';   // who receives the order email
var SHEET_NAME = 'Orders';

function doGet(e) {
  var ss = getSheet_();
  var data = ss.getDataRange().getValues();
  return json_({ ok: true, count: data.length - 1, columns: data[0] || [] });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var sheet = getSheet_();

    if (body.type === 'order') {
      var row = [new Date(), body.text || '', body.method || '', body.name || '', body.email || ''];
      sheet.appendRow(row);

      // Notify the owner by email
      try {
        MailApp.sendEmail({
          to: OWNER_EMAIL,
          subject: 'New Asheerah Hair Order ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
          body: body.text || 'Order received.'
        });
      } catch (mailErr) { /* mail optional */ }

      return json_({ ok: true, saved: true, emailed: true });
    }

    if (body.type === 'contact') {
      sheet.getParent().getSheetByName('Messages') ||
        ss = SpreadsheetApp.getActiveSpreadsheet();
      var ms = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Messages');
      if (!ms) { ms = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Messages'); }
      ms.appendRow([new Date(), body.name || '', body.email || '', body.phone || '', body.comment || '']);
      return json_({ ok: true, saved: true });
    }

    return json_({ ok: false, error: 'Unknown type' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    // Lazy-create on first run
    ss = SpreadsheetApp.create(SS_NAME);
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Order text', 'Payment method', 'Name', 'Email']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#C9A24B').setFontColor('#FFFFFF');
  }
  return sheet;
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
