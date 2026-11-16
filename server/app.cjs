const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { isIP } = require('node:net');
const { pipeline } = require('node:stream/promises');
const { PUBLIC } = require('./build-public.cjs');
const routing = require('../vercel.json');

const handlers = new Map([
  ['/api/enuygun', require('../api/enuygun.js')],
  ['/api/contact', require('../api/contact.js')],
  ['/api/country', require('../api/country.js')],
  ['/api/fx', require('../api/fx.js')]
]);
const redirects = new Map(routing.redirects.map(item => [item.source, item.destination]));
const rewrites = new Map(routing.rewrites.map(item => [item.source, item.destination]));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2'
};
const BODY_LIMIT = 64 * 1024;
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

function jsonResponse(res, status, data) {
  res.statusCode = status;
  if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (Number(req.headers['content-length'] || 0) > BODY_LIMIT) {
    throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
  }
  let size = 0;
  const chunks = [];
  // Do not destroy the socket on a size error; return a useful 413 then close it.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return undefined;
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
    throw Object.assign(new Error('INVALID_CONTENT_TYPE'), { status: 415 });
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
}

function createApp({ publicDirectory = PUBLIC, trustLocalProxy = false } = {}) {
  const publicRoot = fs.realpathSync(publicDirectory);
  if (!fs.statSync(path.join(publicRoot, 'index.html')).isFile()) throw new Error('Run npm run prepare:server first.');
  return http.createServer({ requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      if (!req.url.startsWith('/') || req.url.startsWith('//')) return jsonResponse(res, 400, { error: 'INVALID_URL' });
      const rawPath = req.url.split('?')[0];
      let pathname;
      try { pathname = decodeURIComponent(rawPath); }
      catch { return jsonResponse(res, 400, { error: 'INVALID_URL' }); }
      if (/[\\\u0000-\u001f\u007f]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) {
        return jsonResponse(res, 404, { error: 'NOT_FOUND' });
      }
      const url = new URL(req.url, 'http://localhost');
      if (redirects.has(pathname)) {
        res.writeHead(308, { Location: redirects.get(pathname) + url.search, 'Cache-Control': 'no-cache' });
        return res.end();
      }
      if (pathname === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
        return jsonResponse(res, 200, { ok: true });
      }
      const apiPath = pathname.replace(/\.js$/, '');
      if (handlers.has(apiPath)) {
        // Vercel injects these headers at its edge. On our server client-supplied
        // values must not impersonate the visitor IP or a geolocation service.
        delete req.headers['x-vercel-forwarded-for'];
        delete req.headers['x-vercel-ip-country'];
        const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
        if (!(trustLocalProxy && loopback(req.socket.remoteAddress) && isIP(forwarded))) {
          delete req.headers['x-forwarded-for'];
        }
        req.query = Object.create(null);
        for (const key of new Set(url.searchParams.keys())) {
          const values = url.searchParams.getAll(key);
          req.query[key] = values.length === 1 ? values[0] : values;
        }
        if (req.method === 'HEAD') req.method = 'GET';
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) req.body = await readJson(req);
        res.status = status => { res.statusCode = status; return res; };
        res.json = data => jsonResponse(res, res.statusCode || 200, data);
        await handlers.get(apiPath)(req, res);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return jsonResponse(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      }
      const relative = (rewrites.get(pathname) || (pathname === '/' ? '/index.html' : pathname)).slice(1);
      const requested = path.resolve(publicRoot, relative);
      if (!requested.startsWith(publicRoot + path.sep)) return jsonResponse(res, 404, { error: 'NOT_FOUND' });
      let file, stat;
      try {
        file = await fs.promises.realpath(requested);
        if (!file.startsWith(publicRoot + path.sep)) return jsonResponse(res, 404, { error: 'NOT_FOUND' });
        stat = await fs.promises.stat(file);
      } catch { return jsonResponse(res, 404, { error: 'NOT_FOUND' }); }
      if (!stat.isFile() || !TYPES[path.extname(file)]) return jsonResponse(res, 404, { error: 'NOT_FOUND' });
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)], 'Content-Length': stat.size,
        'Cache-Control': 'no-cache', 'Last-Modified': stat.mtime.toUTCString()
      });
      if (req.method === 'HEAD') return res.end();
      await pipeline(fs.createReadStream(file), res);
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) return res.destroy();
      if (error.status === 413) res.setHeader('Connection', 'close');
      jsonResponse(res, error.status || 500, { error: error.status ? error.message : 'INTERNAL_ERROR' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const host = process.env.HOST || '127.0.0.1';
  const server = createApp({ trustLocalProxy: process.env.TRUST_LOCAL_PROXY === 'true' });
  server.setTimeout(180000);
  server.listen(port, host, () => console.log(`HoliBuddy is listening on ${host}:${port}.`));
  function shutdown() {
    server.close(() => process.exit(0));
    setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 190000).unref();
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
module.exports = { createApp };
