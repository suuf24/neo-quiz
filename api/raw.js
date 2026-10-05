/* GET /api/raw?url=<encoded>
   Fetches one quiz link server-side so the browser never has to deal with
   CORS. Vercel turns every file in /api into an endpoint on the Node runtime;
   this one uses the Web-standard handler shape, so no config is needed.

   The response always carries X-Quiz-Proxy: 1. The app checks that header to
   tell this function apart from a static 404 page or a SPA fallback. */

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB; the largest real quiz is ~30 KB
const TIMEOUT_MS = 12000;
const UA = 'QuizMaster/1.0 (+static quiz reader; fetches one linked text file)';

// No open proxy: only public http(s) hosts are allowed. The WHATWG URL parser
// has already canonicalised every numeric IPv4 form (decimal, octal, short)
// into dotted-quad by the time hostname is read here.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true;
  if (h.startsWith('[')) {
    // IPv6 literal: loopback (::1), unspecified (::), link-local (fe80::/10),
    // and unique-local (fc00::/7).
    const v6 = h.slice(1, -1);
    if (v6 === '::1' || v6 === '::') return true;
    if (/^fe[89ab]/.test(v6) || /^f[cd]/.test(v6)) return true;
    return false;
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  // A public hostname always has a dot (and a TLD); single-label names are
  // intranet hosts.
  if (!h.includes('.')) return true;
  return false;
}

async function fetchUpstream(target) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(target, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/plain, text/*;q=0.9, */*;q=0.5'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request) {
    const headers = { 'X-Quiz-Proxy': '1', 'Cache-Control': 'no-store' };
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers });
    }

    let target;
    try {
      const raw = new URL(request.url).searchParams.get('url') || '';
      target = new URL(raw);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('protocol');
      if (isBlockedHost(target.hostname)) throw new Error('host');
    } catch {
      return new Response('Bad url parameter', { status: 400, headers });
    }

    try {
      const upstream = await fetchUpstream(target);
      if (!upstream.ok) {
        // Repeat the host's own answer (404, 403, ...) so the app can show it.
        return new Response('Upstream ' + upstream.status, { status: upstream.status, headers });
      }
      const declared = Number(upstream.headers.get('content-length') || 0);
      if (declared > MAX_BYTES) {
        return new Response('Quiz file too large', { status: 413, headers });
      }
      const text = await upstream.text();
      if (text.length > MAX_BYTES) {
        return new Response('Quiz file too large', { status: 413, headers });
      }
      return new Response(text, {
        status: 200,
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }
      });
    } catch {
      // Timeout, DNS failure, TLS error: the app reads 502 as "try a proxy".
      return new Response('Upstream fetch failed', { status: 502, headers });
    }
  }
};
