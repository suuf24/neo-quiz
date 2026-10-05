/* GET /api/quiz?code=XXXX -> teks kuis apa adanya dari kolom "questions" di Sheets */
module.exports = async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) return res.status(400).send('bad code');
  try {
    const u = process.env.APPS_SCRIPT_URL + '?code=' + encodeURIComponent(code) + '&secret=' + encodeURIComponent(process.env.APPS_SCRIPT_SECRET);
    const d = await (await fetch(u, { redirect: 'follow' })).json();
    if (!d.ok) return res.status(d.error === 'notfound' ? 404 : 502).send(d.error);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(d.text);
  } catch (e) {
    return res.status(502).send('store');
  }
};
