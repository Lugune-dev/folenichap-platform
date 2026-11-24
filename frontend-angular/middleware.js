/**
 * Vercel Routing Middleware: proxies /api/* to the Spring Boot API on Render.
 *
 * Why a proxy and not calling Render directly from the browser: the refresh token lives in an
 * HttpOnly SameSite=Strict cookie, which browsers only send to the same site. Going through
 * this middleware keeps the app and the API on one origin (no CORS, no third-party cookies).
 *
 * Environment variables (Vercel -> Project -> Settings -> Environment Variables):
 *   BACKEND_URL          e.g. https://folenichap-api.onrender.com   (no trailing slash)
 *   PROXY_SHARED_SECRET  same value as on Render (openssl rand -hex 24)
 */
export const config = { matcher: '/api/:path*' };

// Render's free plan sleeps when idle; waking a Java app can take longer than Vercel lets us wait.
const WAIT_FOR_HEADERS_MS = 22_000;

// Hop-by-hop and client-controlled headers that must not be forwarded.
const DROP_REQUEST = ['host', 'connection', 'accept-encoding', 'content-length', 'x-forwarded-for',
  'x-forwarded-host', 'x-real-ip', 'x-proxy-secret', 'x-client-ip', 'forwarded'];

function json(status, code, detail) {
  return new Response(JSON.stringify({ status, code, detail }), {
    status, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' }
  });
}

export default async function middleware(request) {
  const backend = process.env.BACKEND_URL;
  const secret = process.env.PROXY_SHARED_SECRET;
  if (!backend || !secret) return json(500, 'SERVER_ERROR', 'Proxy is not configured');

  const url = new URL(request.url);
  const target = backend.replace(/\/+$/, '') + url.pathname + url.search;

  const headers = new Headers(request.headers);
  for (const h of DROP_REQUEST) headers.delete(h);
  // Vercel sets x-forwarded-for itself (clients cannot spoof it); its first entry is the visitor.
  const clientIp = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '').split(',')[0].trim();
  if (clientIp) headers.set('x-client-ip', clientIp);
  headers.set('x-proxy-secret', secret);
  headers.set('x-forwarded-proto', 'https');
  headers.set('accept-encoding', 'identity'); // Vercel compresses for the browser; avoids double-encoding

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), WAIT_FOR_HEADERS_MS);

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      // bodies are small JSON (nginx allowed 2 MB); buffering keeps webhook signatures byte-exact
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      signal: abort.signal
    });
  } catch {
    return json(503, 'SERVER_WAKING', 'The server is starting up. Please try again in a moment.');
  } finally {
    clearTimeout(timer); // only the wait for headers is limited; long event streams continue
  }

  const out = new Headers(upstream.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  out.delete('transfer-encoding');
  if ((out.get('content-type') || '').startsWith('text/event-stream')) {
    out.set('cache-control', 'no-cache, no-transform');
  }
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
