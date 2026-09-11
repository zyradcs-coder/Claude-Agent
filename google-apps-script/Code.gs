/**
 * ZYRA WhatsApp -> Google Sheets logger
 *
 * Setup:
 *  1. Create a Google Sheet.
 *  2. Extensions -> Apps Script. Paste this file in (replace everything).
 *  3. Set SECRET below to the same value as SHEETS_WEBAPP_SECRET in .env.local.
 *  4. Deploy -> New deployment -> type "Web app".
 *       Execute as: Me
 *       Who has access: Anyone
 *  5. Copy the Web app URL (ends with /exec) into SHEETS_WEBAPP_URL in .env.local
 *     and in Vercel's environment variables.
 *
 * The "Messages" and "Leads" tabs are created automatically on the first write.
 */

var SECRET = 'BZsLcK5PdI78Ev8__j36ffi2';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) {
      return json({ ok: false, error: 'unauthorized' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    appendMessage(ss, body);
    upsertLead(ss, body);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var secret = e && e.parameter && e.parameter.secret;
  if (secret !== SECRET) {
    return json({ ok: true, service: 'zyra-whatsapp-sheets' });
  }

  // ?secret=... &status=1  -> row counts + the last few rows of each tab,
  // so setup can be verified without opening the sheet.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { ok: true, sheetUrl: ss.getUrl(), tabs: {} };
  ['Messages', 'Leads'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      out.tabs[name] = { exists: false };
      return;
    }
    var values = sh.getDataRange().getValues();
    out.tabs[name] = {
      exists: true,
      rowCount: Math.max(0, values.length - 1),
      headers: values[0] || [],
      lastRows: values.slice(Math.max(1, values.length - 5)),
    };
  });
  return json(out);
}

// Meta sends phone numbers as bare digits (e.g. "971547824637"). Sheets
// auto-detects all-digit strings as numbers, which can lose formatting -
// normalize to a "+"-prefixed WhatsApp-style string and force the column
// to Plain text so it always displays exactly as typed.
function formatPhone(phone) {
  var digits = String(phone || '').replace(/[^\d]/g, '');
  return digits ? '+' + digits : '';
}

function appendMessage(ss, b) {
  var sh = getOrCreate(ss, 'Messages', [
    'Timestamp', 'WhatsApp Number', 'Name', 'Direction', 'Message', 'Language',
  ]);
  sh.appendRow([
    new Date(), formatPhone(b.phone), b.name || '', b.direction || '',
    b.text || '', b.language || '',
  ]);
}

function upsertLead(ss, b) {
  var sh = getOrCreate(ss, 'Leads', [
    'First contact', 'WhatsApp Number', 'Name', 'First message',
    'Last activity', 'Status', 'Message count',
  ]);
  var phone = formatPhone(b.phone);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (formatPhone(rows[i][1]) === phone) {
      if (b.name) sh.getRange(i + 1, 3).setValue(b.name);
      sh.getRange(i + 1, 5).setValue(new Date());
      if (b.status) sh.getRange(i + 1, 6).setValue(b.status);
      sh.getRange(i + 1, 7).setValue((Number(rows[i][6]) || 0) + 1);
      return;
    }
  }
  sh.appendRow([
    new Date(), phone, b.name || '',
    b.direction === 'inbound' ? (b.text || '') : '',
    new Date(), b.status || 'bot', 1,
  ]);
}

function getOrCreate(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  } else {
    // Keep an already-existing sheet's header row in sync (e.g. renamed columns).
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  // Column 2 (WhatsApp Number) as Plain text for every row, so it never
  // gets auto-converted to a number and never shows scientific notation.
  sh.getRange(1, 2, Math.max(sh.getMaxRows(), 1000), 1).setNumberFormat('@');
  return sh;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
