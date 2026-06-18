/**
 * WarmChats — Newsletter signups → Google Sheet
 *
 * Appends every newsletter signup (from the landing-page footer) as a new row
 * in the sheet:  https://docs.google.com/spreadsheets/d/1cgCM42iWnHuzTm0q_ZCtUCF7lbPo38gEXPdYq9u-rjo
 *
 * ── HOW TO DEPLOY (≈2 minutes) ───────────────────────────────────────────────
 * 1. Open that Google Sheet.
 * 2. Menu:  Extensions → Apps Script.
 * 3. Delete whatever code is there and paste THIS whole file in.
 * 4. Click  Deploy → New deployment.
 *      • Select type (gear icon) → "Web app"
 *      • Description: "WarmChats newsletter"
 *      • Execute as:  Me (your account)
 *      • Who has access:  Anyone           ← important (the site posts anonymously)
 *      • Click Deploy, authorize when prompted.
 * 5. Copy the "Web app" URL — it ends in /exec  (looks like
 *      https://script.google.com/macros/s/AKfycb..../exec )
 * 6. Send me that URL. I'll set VITE_NEWSLETTER_SCRIPT_URL and redeploy the site.
 *
 * (Optional) Add a header row to the sheet:  Email | Source | Date
 * ─────────────────────────────────────────────────────────────────────────────
 */

var SHEET_ID = "1cgCM42iWnHuzTm0q_ZCtUCF7lbPo38gEXPdYq9u-rjo";

function doPost(e) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheets()[0]; // first tab (gid=0)

    // Body may arrive as JSON (our site) or form params — handle both.
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch (err) { data = {}; }
    }
    if (!data.email && e && e.parameter) data = e.parameter;

    var email = String(data.email || "").trim();
    if (!email) {
      return json({ ok: false, error: "missing email" });
    }

    // Skip duplicates (case-insensitive) so the list stays clean.
    var lastRow = sheet.getLastRow();
    if (lastRow > 0) {
      var existing = sheet.getRange(1, 1, lastRow, 1).getValues();
      for (var i = 0; i < existing.length; i++) {
        if (String(existing[i][0]).trim().toLowerCase() === email.toLowerCase()) {
          return json({ ok: true, duplicate: true });
        }
      }
    }

    sheet.appendRow([email, data.source || "newsletter", new Date()]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// A GET in the browser just confirms the script is live.
function doGet() {
  return json({ ok: true, service: "warmchats-newsletter" });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
