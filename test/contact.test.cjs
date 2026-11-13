const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const handler = require('../api/contact.js');
Object.assign(process.env, { CONTACT_EMAIL_ENABLED: 'true', CONTACT_SMTP_HOST: 'smtp.example.com', CONTACT_SMTP_PORT: '587', CONTACT_SMTP_USER: 'sender@example.com', CONTACT_SMTP_PASSWORD: 'synthetic-test-secret', CONTACT_FROM_EMAIL: 'sender@example.com' });
let sequence = 0;
function request(overrides = {}) {
  return {
    method: 'POST',
    headers: { origin: 'https://holibuddy.com', 'content-type': 'application/json', 'x-vercel-forwarded-for': `198.51.100.${++sequence}` },
    body: { category: 'reservation', name: 'Form Test', email: 'test@example.com', message: 'This is a synthetic contact form test.', phone: '', reference: '', company: '', website: '' },
    ...overrides
  };
}
async function run(req, provider) {
  let sent, options;
  const original = nodemailer.createTransport;
  nodemailer.createTransport = settings => {
    options = settings;
    return { sendMail: async message => { sent = message; if (provider instanceof Error) throw provider; return provider || { accepted: [message.to], rejected: [] }; } };
  };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } };
  try { await handler(req, res); } finally { nodemailer.createTransport = original; }
  return { res, sent, options };
}
test('routes all categories to fixed recipients and ignores recipient/header injection', async () => {
  for (const category of ['reservation', 'aftersales', 'partnership', 'other']) {
    const req = request();
    req.body = { ...req.body, category, company: 'Example Company', to: 'attacker@example.com', cc: 'attacker@example.com', from: 'attacker@example.com' };
    const { res, sent, options } = await run(req);
    assert.equal(res.statusCode, 200);
    assert.equal(sent.to, category === 'partnership' ? 'info@holibuddy.com' : 'cssupport@holibuddy.com');
    assert.equal(sent.replyTo.address, 'test@example.com');
    assert.equal(sent.cc, undefined);
    assert.equal(sent.from.address, 'sender@example.com');
    assert.equal(sent.text.includes('Example Company'), category === 'partnership');
    assert.equal(options.requireTLS, true);
    assert.equal(options.tls.rejectUnauthorized, true);
    assert.equal(options.disableFileAccess, true);
    assert.equal(options.disableUrlAccess, true);
  }
});
test('unconfigured server exposes only draft mode and never sends or claims delivery', async () => {
  delete process.env.CONTACT_EMAIL_ENABLED;
  try {
    const { res, sent } = await run(request());
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'DELIVERY_NOT_CONFIGURED');
    assert.equal(sent, undefined);
    const state = await run(request({ method: 'GET' }));
    assert.deepEqual(state.res.body, { mode: 'email-draft' });
  } finally { process.env.CONTACT_EMAIL_ENABLED = 'true'; }
  assert.deepEqual((await run(request({ method: 'GET' }))).res.body, { mode: 'smtp' });
});
test('does not claim delivery for rejection, missing recipient or transport failure', async () => {
  for (const result of [{ accepted: [], rejected: ['cssupport@holibuddy.com'] }, { accepted: ['other@example.com'], rejected: [] }, new Error('timeout')]) {
    const { res } = await run(request(), result);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.ok, false);
  }
});
test('rejects invalid inputs before contacting SMTP', async () => {
  for (const bad of [{ category: '__proto__' }, { category: 'invalid' }, { email: 'bad\r\nBcc:other@example.com' }, { name: { value: 'x' } }, { message: 'short' }, { message: 'a'.repeat(5001) }, { website: 'bot' }, { phone: 'not-a-number' }]) {
    const req = request(); req.body = { ...req.body, ...bad };
    const { res, sent } = await run(req);
    assert.equal(res.statusCode, 400);
    assert.equal(sent, undefined);
  }
});
test('enforces method, origin, content type and size', async () => {
  for (const [overrides, expected] of [[{ method: 'PUT' }, 405], [{ headers: { origin: 'https://evil.example', 'content-type': 'application/json' } }, 403], [{ headers: { origin: 'https://holibuddy.com', 'content-type': 'text/plain' } }, 415], [{ headers: { origin: 'https://holibuddy.com', 'content-type': 'application/json', 'content-length': '25000' } }, 413], [{ body: '{broken' }, 400]]) {
    const { res, sent } = await run(request(overrides));
    assert.equal(res.statusCode, expected);
    assert.equal(sent, undefined);
  }
});
test('throttles repeated submissions in a warm function instance', async () => {
  const req = request();
  for (let i = 0; i < 5; i++) assert.equal((await run(req)).res.statusCode, 200);
  const { res, sent } = await run(req);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '900');
  assert.equal(sent, undefined);
});
