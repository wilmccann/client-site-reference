// The whole website as one small server: the built Astro pages (./public) and the
// CMS sign-in (/auth, /callback). It uses only Node's built-in modules, so there are no
// npm packages to keep up to date, and Cloud Run's automatic base image updates keep
// Node.js and the operating system patched. See README.md, "Architecture".
import { createHash, randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 8080;
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
// Pages allowed to receive a CMS sign-in token: wherever /admin is opened from.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://example.com')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json)|image\/svg\+xml)/;

// ---------- Static pages ----------

// Files never change while a revision runs, so each is read and hashed once.
const cache = new Map();
const CACHE_MAX_FILE = 10 * 1024 * 1024;

async function statOrNull(file) {
  try {
    return await stat(file);
  } catch {
    return null;
  }
}

// Same lookup order as a typical static host: the file, the folder's index.html, then name.html.
async function findFile(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  // No null bytes, no "..", and no hidden files such as .DS_Store.
  if (rel.includes('\0') || rel.split('/').some((part) => part.startsWith('.'))) return null;
  const full = path.join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;

  const found = await statOrNull(full);
  if (found?.isFile()) return { file: full };
  if (found?.isDirectory()) {
    if (!pathname.endsWith('/')) return { redirect: `${pathname}/` };
    const index = path.join(full, 'index.html');
    return (await statOrNull(index))?.isFile() ? { file: index } : null;
  }
  if (!pathname.endsWith('/') && (await statOrNull(`${full}.html`))?.isFile()) {
    return { file: `${full}.html` };
  }
  return null;
}

async function load(file) {
  if (cache.has(file)) return cache.get(file);
  const body = await readFile(file);
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const entry = {
    body,
    type,
    etag: `W/"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`,
    gzipped: COMPRESSIBLE.test(type) && body.length > 1024 ? gzipSync(body) : null,
  };
  if (body.length <= CACHE_MAX_FILE) cache.set(file, entry);
  return entry;
}

async function sendFile(req, res, pathname, file, status = 200) {
  const { body, type, etag, gzipped } = await load(file);
  const headers = {
    'Content-Type': type,
    // Astro's build output has content hashes in its names, so it never changes in place.
    // Everything else (pages, theme.css, images) must be rechecked by browsers.
    'Cache-Control': pathname.startsWith('/_astro/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };
  if (gzipped) headers.Vary = 'Accept-Encoding';

  const ifNoneMatch = req.headers['if-none-match'];
  if (status === 200 && ifNoneMatch?.split(',').some((tag) => tag.trim() === etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  let payload = body;
  if (gzipped && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    payload = gzipped;
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = payload.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

async function serveStatic(req, res, url) {
  const found = await findFile(url.pathname);
  if (found?.redirect) {
    // Relative, like nginx's "absolute_redirect off": no internal host or port leaks out.
    res.writeHead(301, { Location: found.redirect + url.search, 'Cache-Control': 'no-cache' });
    res.end();
    return;
  }
  if (found) {
    await sendFile(req, res, url.pathname, found.file);
    return;
  }
  const notFound = path.join(ROOT, '404.html');
  if ((await statOrNull(notFound))?.isFile()) {
    await sendFile(req, res, '/404.html', notFound, 404);
  } else {
    sendText(res, 404, 'Not found');
  }
}

// ---------- CMS sign-in (GitHub OAuth for Sveltia CMS) ----------

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(text);
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

function callbackUrl(req) {
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${req.headers.host}/callback`;
}

// Safe to place inside an inline <script>.
function scriptLiteral(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029');
}

function startSignIn(req, res) {
  if (!CLIENT_ID) {
    sendText(res, 500, 'GitHub sign-in is not configured (GITHUB_CLIENT_ID is missing).');
    return;
  }
  const state = randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: callbackUrl(req),
    scope: 'repo',
    state,
  });
  res.writeHead(302, {
    Location: `https://github.com/login/oauth/authorize?${params}`,
    'Set-Cookie': `oauth_state=${state}; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax`,
    'Cache-Control': 'no-store',
  });
  res.end();
}

async function finishSignIn(req, res, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = readCookie(req, 'oauth_state');
  const clearCookie = {
    'Set-Cookie': 'oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
  };
  if (!code || !state || !cookieState || state !== cookieState) {
    sendText(res, 400, 'Invalid or missing sign-in state. Please try signing in again.', clearCookie);
    return;
  }

  let tokenData;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl(req),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    tokenData = await tokenRes.json();
    if (!tokenRes.ok) tokenData.error ||= `HTTP ${tokenRes.status}`;
  } catch (err) {
    console.error('GitHub token exchange failed:', err);
    sendText(res, 502, 'Could not reach GitHub. Please try signing in again.', clearCookie);
    return;
  }
  if (tokenData.error || !tokenData.access_token) {
    const reason = tokenData.error_description || tokenData.error || 'unknown error';
    sendText(res, 400, `GitHub sign-in error: ${reason}`, clearCookie);
    return;
  }

  // Sveltia CMS's popup handshake: announce to the opener, wait for it to answer, then send
  // the token only to the origin that answered, and only if it's an allowed one.
  const message = `authorization:github:success:${JSON.stringify({
    token: tokenData.access_token,
    provider: 'github',
  })}`;
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    ...clearCookie,
  });
  res.end(`<!doctype html>
<html><body>
<script>
(function () {
  var allowed = ${scriptLiteral(ALLOWED_ORIGINS)};
  var message = ${scriptLiteral(message)};
  if (!window.opener) return;
  function receive(e) {
    if (e.data !== 'authorizing:github' || allowed.indexOf(e.origin) === -1) return;
    window.removeEventListener('message', receive, false);
    window.opener.postMessage(message, e.origin);
  }
  window.addEventListener('message', receive, false);
  allowed.forEach(function (origin) { window.opener.postMessage('authorizing:github', origin); });
})();
</script>
Signed in. You can close this window if it does not close automatically.
</body></html>`);
}

// ---------- Routing ----------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    } else if (url.pathname === '/auth') {
      startSignIn(req, res);
    } else if (url.pathname === '/callback') {
      await finishSignIn(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (err) {
    console.error('Request failed:', req.method, req.url, err);
    if (!res.headersSent) sendText(res, 500, 'Something went wrong.');
    else res.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Site server listening on ${PORT}`);
});
