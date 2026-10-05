/* GET /api/quiz?code=ABC234 -> teks format kuis (Title + baris "soal | *benar | opsi") */
module.exports = async (req, res) => {
  const code = String(req.query.code || '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return res.status(400).send('bad code');
  try {
    const u = process.env.APPS_SCRIPT_URL + '?code=' + code + '&secret=' + encodeURIComponent(process.env.APPS_SCRIPT_SECRET);
    const d = await (await fetch(u, { redirect: 'follow' })).json();
    if (!d.ok) return res.status(d.error === 'notfound' ? 404 : 502).send(d.error);
    const lines = ['Title: ' + d.title, ''];
    d.questions.forEach((q) => {
      const opts = q.options.map((o, i) => (i === q.correctIndex ? '*' : '') + o);
      lines.push([q.question].concat(opts).join(' | '));
    });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(lines.join('\n') + '\n');
  } catch (e) {
    return res.status(502).send('store');
  }
};
