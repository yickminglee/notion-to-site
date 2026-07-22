/**
 * Minimal static file server for the built site (Railway start command).
 * Zero dependencies — serves ./dist, binds the platform-provided PORT.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchored to this file, not the process cwd, so `node server.mjs` works from anywhere.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');

// Railway supplies PORT; --port is for running locally alongside the dev server.
const portFlag = process.argv.indexOf('--port');
const PORT =
  (portFlag !== -1 && Number(process.argv[portFlag + 1])) || Number(process.env.PORT) || 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

if (!existsSync(ROOT)) {
  console.error('dist/ not found — run `npm run build` before `npm start`.');
  process.exit(1);
}

/** Resolve a URL path to a file inside ROOT, or null if it escapes/misses. */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  // normalize() collapses ../ so a crafted path cannot escape dist/.
  const candidate = resolve(join(ROOT, normalize(decoded)));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + '/')) return null;

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    const index = join(candidate, 'index.html');
    return existsSync(index) ? index : null;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

  const asHtml = `${candidate}.html`;
  return existsSync(asHtml) ? asHtml : null;
}

createServer((req, res) => {
  const file = resolveFile(req.url ?? '/');

  if (!file) {
    const notFound = join(ROOT, '404.html');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    if (existsSync(notFound)) return createReadStream(notFound).pipe(res);
    return res.end('<h1>404 Not found</h1>');
  }

  const ext = extname(file).toLowerCase();
  // Hashed asset filenames are immutable; HTML must revalidate so redeploys show up.
  const cache = ext === '.html' || ext === '.xml'
    ? 'public, max-age=0, must-revalidate'
    : 'public, max-age=31536000, immutable';

  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': cache });
  createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`serving dist/ on http://0.0.0.0:${PORT}`);
});
