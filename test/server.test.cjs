const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { buildPublic, PUBLIC } = require('../server/build-public.cjs');
const { createApp } = require('../server/app.cjs');

let server, port;
test.before(async () => {
  buildPublic();
  server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
});
test.after(() => new Promise(resolve => server.close(resolve)));

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('serves the current home page, clean routes, client scripts, images and fonts', async () => {
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.equal(home.body, fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'));
  for (const route of ['/yardim', '/iletisim?konu=aftersales', '/gizlilik-politikasi', '/kvkk', '/ticari-ileti', '/cerez-politikasi', '/hesabim.html?mode=demo']) {
    const response = await request(route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers['content-type'], /^text\/html/);
  }
  for (const [route, type] of [['/privacy-manager.js', 'text/javascript'], ['/iletisim.css', 'text/css'], ['/images/dublin.jpg', 'image/jpeg'], ['/css/font/gothic.woff', 'font/woff']]) {
    const response = await request(route, { method: 'HEAD' });
    assert.equal(response.status, 200, route);
    assert.ok(response.headers['content-type'].startsWith(type));
    assert.equal(response.body, '');
    assert.ok(Number(response.headers['content-length']) > 0);
  }
});

test('preserves query parameters across the existing permanent redirects', async () => {
  for (const [from, to] of [['/holibuddy.html', '/'], ['/iletisim.html', '/iletisim'], ['/yardim.html', '/yardim']]) {
    const response = await request(from + '?konu=aftersales&lang=en');
    assert.equal(response.status, 308);
    assert.equal(response.headers.location, to + '?konu=aftersales&lang=en');
  }
});

test('does not publish source, secrets, configuration or path traversal targets', async () => {
  for (const route of ['/.env', '/%2eenv', '/.git/config', '/package.json', '/package-lock.json', '/vercel.json', '/config/newsletter-consent.json', '/server/app.cjs', '/deploy/holibuddy.env.example', '/api/contact.js.map', '/docs/server-migration.md', '/%2e%2e/index.html', '/images/%2e%2e/%2eenv', '/images%5c..%5c.env']) {
    const response = await request(route);
    assert.equal(response.status, 404, route);
  }
  assert.equal((await request('/bad%')).status, 400);
  assert.equal((await request('//outside.example')).status, 400);
  assert.equal((await request('/', { method: 'POST' })).status, 405);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'holibuddy-server-'));
  const outside = path.join(directory, 'private.html');
  const link = path.join(PUBLIC, 'outside.html');
  fs.writeFileSync(outside, 'Private data');
  fs.symlinkSync(outside, link);
  try { assert.equal((await request('/outside.html')).status, 404); }
  finally { fs.unlinkSync(link); fs.rmSync(directory, { recursive: true }); }
});

test('exposes health and API status without depending on Vercel or making outbound calls', async () => {
  delete process.env.CONTACT_EMAIL_ENABLED;
  delete process.env.ENUYGUN_API_USERNAME;
  delete process.env.ENUYGUN_API_PASSWORD;
  assert.deepEqual(JSON.parse((await request('/healthz')).body), { ok: true });
  assert.deepEqual(JSON.parse((await request('/api/contact')).body), { mode: 'email-draft' });
  assert.deepEqual(JSON.parse((await request('/api/enuygun?action=status')).body), { configured: false, provider: 'Enuygun' });
  const country = await request('/api/country', { headers: { 'x-vercel-ip-country': 'US' } });
  assert.deepEqual(JSON.parse(country.body), { country: '' });
  assert.equal((await request('/api/country', { method: 'HEAD' })).body, '');
});

test('parses API JSON and query arguments before invoking the existing Enuygun handler', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  process.env.ENUYGUN_API_USERNAME = 'synthetic-user';
  process.env.ENUYGUN_API_PASSWORD = 'synthetic-password';
  global.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => url.endsWith('/login') ? { data: { token: 'synthetic-token' } } : { data: { offers: [] } } };
  };
  try {
    const body = { pickupDate: '2026-12-01', dropOffDate: '2026-12-03', pickupTime: '10:00', dropOffTime: '10:00', pickupLocation: 'istanbul-airport', dropOffLocation: 'istanbul-airport', language: 'tr', currency: 'TRY', driverAge: 30 };
    const response = await request('/api/enuygun?action=search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { data: { offers: [] } });
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /\/api\/v1\/search$/);
    assert.deepEqual(calls[1].body, body);
  } finally {
    global.fetch = originalFetch;
    delete process.env.ENUYGUN_API_USERNAME;
    delete process.env.ENUYGUN_API_PASSWORD;
  }
});

test('rejects malformed, oversized and wrong-type API bodies before provider calls', async () => {
  for (const [body, type, status] of [['{broken', 'application/json', 400], ['[]', 'application/json', 400], ['{}', 'text/plain', 415], ['x'.repeat(65537), 'application/json', 413]]) {
    const response = await request('/api/enuygun?action=search', { method: 'POST', headers: { 'content-type': type }, body });
    assert.equal(response.status, status);
  }
});

test('strips spoofed visitor IP headers so contact throttling cannot be bypassed', async () => {
  const nodemailer = require('nodemailer');
  const original = nodemailer.createTransport;
  const keys = ['CONTACT_EMAIL_ENABLED', 'CONTACT_SMTP_HOST', 'CONTACT_SMTP_USER', 'CONTACT_SMTP_PASSWORD', 'CONTACT_FROM_EMAIL'];
  Object.assign(process.env, { CONTACT_EMAIL_ENABLED: 'true', CONTACT_SMTP_HOST: 'smtp.example.com', CONTACT_SMTP_USER: 'test@example.com', CONTACT_SMTP_PASSWORD: 'synthetic-secret', CONTACT_FROM_EMAIL: 'test@example.com' });
  let sent = 0;
  nodemailer.createTransport = () => ({ sendMail: async message => { sent++; return { accepted: [message.to], rejected: [] }; } });
  try {
    for (let i = 1; i <= 6; i++) {
      const response = await request('/api/contact', {
        method: 'POST',
        headers: { origin: 'https://holibuddy.com', 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${i}`, 'x-vercel-forwarded-for': `198.51.100.${i}` },
        body: JSON.stringify({ category: 'partnership', name: 'Example Contact', email: 'test@example.com', message: 'Synthetic transport test message.' })
      });
      assert.equal(response.status, i <= 5 ? 200 : 429);
      if (i <= 5) assert.equal(JSON.parse(response.body).recipient, 'info@holibuddy.com');
    }
    assert.equal(sent, 5);
  } finally {
    nodemailer.createTransport = original;
    for (const key of keys) delete process.env[key];
  }
});
