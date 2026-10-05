/* Quiz Master: penyimpanan soal di Google Sheets (2 kolom).
 * Sheet pertama:  code | questions
 *   - code      : kode kuis (dibuat otomatis 6 karakter, atau isi manual)
 *   - questions : seluruh kuis dalam satu sel, format TXT:
 *                 Title: Judul
 *                 1. Soal | *jawaban benar | opsi | opsi
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Access: Anyone.
 * Script Properties: SECRET (string acak, sama dengan APPS_SCRIPT_SECRET di Vercel).
 * Batas Google Sheets: 50.000 karakter per sel.
 */
var DAILY_CAP = 300;
var MAX_CELL = 49000;
var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function sheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(['code', 'questions']);
  return sh;
}
function secretOk_(s) {
  return s && s === PropertiesService.getScriptProperties().getProperty('SECRET');
}
function findRow_(sh, code) {
  var r = sh.getRange('A:A').createTextFinder(code).matchCase(false).matchEntireCell(true).findNext();
  return r && r.getRow() > 1 ? r.getRow() : 0;
}
function newCode_(sh) {
  for (var t = 0; t < 20; t++) {
    var c = '';
    for (var i = 0; i < 6; i++) c += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    if (!findRow_(sh, c)) return c;
  }
  throw new Error('code');
}
function underCap_() {
  var p = PropertiesService.getScriptProperties();
  var day = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd');
  var n = (p.getProperty('cap_' + day) | 0) + 1;
  if (n > DAILY_CAP) return false;
  p.setProperty('cap_' + day, String(n));
  return true;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var d = JSON.parse(e.postData.contents);
    if (!secretOk_(d.secret)) return out_({ ok: false, error: 'auth' });
    var text = String(d.text || '');
    if (text.length < 10 || text.length > MAX_CELL) return out_({ ok: false, error: 'bad' });
    lock.waitLock(10000);
    if (!underCap_()) return out_({ ok: false, error: 'quota' });
    var sh = sheet_();
    var code = newCode_(sh);
    var row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 2).setNumberFormat('@').setValues([[code, text]]);
    return out_({ ok: true, code: code });
  } catch (err) {
    return out_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet(e) {
  var p = e.parameter || {};
  var code = String(p.code || '').trim();
  if (!secretOk_(p.secret) || !/^[A-Za-z0-9_-]{3,40}$/.test(code)) return out_({ ok: false, error: 'bad' });
  var cache = CacheService.getScriptCache();
  var key = 'q_' + code.toLowerCase();
  var hit = cache.get(key);
  if (hit) return out_({ ok: true, text: hit });
  var sh = sheet_();
  var row = findRow_(sh, code);
  if (!row) return out_({ ok: false, error: 'notfound' });
  var text = String(sh.getRange(row, 2).getValue());
  if (!text.trim()) return out_({ ok: false, error: 'notfound' });
  cache.put(key, text, 21600);
  return out_({ ok: true, text: text });
}
