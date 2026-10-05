/* Quiz Master: penyimpanan soal di Google Sheets.
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Access: Anyone.
 * Script Properties: SECRET (string acak, sama dengan APPS_SCRIPT_SECRET di Vercel).
 * Sheet "quizzes": code | title | created_at | count | topic | grade | level
 * Sheet "questions": code | no | question | A | B | C | D | E | correct (huruf)
 */
var DAILY_CAP = 300;
var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function sheet_(name, header) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(header);
  return sh;
}
function secretOk_(s) {
  return s && s === PropertiesService.getScriptProperties().getProperty('SECRET');
}
function newCode_(quizzes) {
  var existing = {};
  var last = quizzes.getLastRow();
  if (last > 1) quizzes.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { existing[r[0]] = 1; });
  for (var t = 0; t < 20; t++) {
    var c = '';
    for (var i = 0; i < 6; i++) c += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    if (!existing[c]) return c;
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
    if (!d.questions || !d.questions.length || d.questions.length > 40) return out_({ ok: false, error: 'bad' });
    lock.waitLock(10000);
    if (!underCap_()) return out_({ ok: false, error: 'quota' });
    var quizzes = sheet_('quizzes', ['code', 'title', 'created_at', 'count', 'topic', 'grade', 'level']);
    var qs = sheet_('questions', ['code', 'no', 'question', 'A', 'B', 'C', 'D', 'E', 'correct']);
    var code = newCode_(quizzes);
    quizzes.appendRow([code, d.title, new Date(), d.questions.length, d.topic || '', d.grade || '', d.level || '']);
    var rows = d.questions.map(function (q, i) {
      var o = q.options.slice(0, 5);
      while (o.length < 5) o.push('');
      return [code, i + 1, q.question].concat(o, [String.fromCharCode(65 + q.correctIndex)]);
    });
    qs.getRange(qs.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
    return out_({ ok: true, code: code });
  } catch (err) {
    return out_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet(e) {
  var code = String((e.parameter || {}).code || '').toUpperCase();
  if (!secretOk_((e.parameter || {}).secret) || !/^[A-Z0-9]{6}$/.test(code)) return out_({ ok: false, error: 'bad' });
  var cache = CacheService.getScriptCache();
  var hit = cache.get('q_' + code);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var quizzes = sheet_('quizzes', ['code', 'title', 'created_at', 'count', 'topic', 'grade', 'level']);
  var qs = sheet_('questions', ['code', 'no', 'question', 'A', 'B', 'C', 'D', 'E', 'correct']);
  var title = null;
  var ql = quizzes.getLastRow();
  if (ql > 1) {
    var f = quizzes.getRange(2, 1, ql - 1, 2).getValues();
    for (var i = 0; i < f.length; i++) if (f[i][0] === code) { title = f[i][1]; break; }
  }
  if (title === null) return out_({ ok: false, error: 'notfound' });
  var last = qs.getLastRow();
  var all = last > 1 ? qs.getRange(2, 1, last - 1, 9).getValues() : [];
  var list = all.filter(function (r) { return r[0] === code; })
    .sort(function (a, b) { return a[1] - b[1]; })
    .map(function (r) {
      var opts = r.slice(3, 8).filter(function (x) { return String(x) !== ''; }).map(String);
      return { question: String(r[2]), options: opts, correctIndex: String(r[8]).charCodeAt(0) - 65 };
    });
  var json = JSON.stringify({ ok: true, title: title, questions: list });
  if (json.length < 90000) cache.put('q_' + code, json, 21600);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
