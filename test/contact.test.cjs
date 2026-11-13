const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/contact.js');
let sequence = 0;
function request(overrides = {}) {
  return {
    method: 'POST',
    headers: { origin: 'https://holibuddy.com', 'content-type': 'application/json', 'x-vercel-forwarded-for': `198.51.100.${++sequence}` },
    body: { category: 'reservation', name: 'Form Test', email: 'test@example.com', message: 'This is a synthetic contact form test.', phone: '', reference: '', company: '', website: '' },
    ...overrides
  };
}
async function run(req, provider = { success: true, message: 'Thanks! Your form has been submitted successfully.' }, status = 200) {
  let sent;
  const original = global.fetch;
  global.fetch = async (url, init) => { sent = { url, init, payload: JSON.parse(init.body) }; if (provider instanceof Error) throw provider; return { ok: status >= 200 && status < 300, json: async () => provider }; };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } };
  try { await handler(req, res); } finally { global.fetch = original; }
  return { res, sent };
}
test('routes all four categories to the specified addresses and ignores injected recipients', async () => {
  for (const category of ['reservation', 'aftersales', 'partnership', 'other']) {
    const req = request();
    req.body = { ...req.body, category, company: 'Example Company', to: 'attacker@example.com', _cc: 'attacker@example.com' };
    const { res, sent } = await run(req);
    const expected = category === 'partnership' ? 'info@holibuddy.com' : 'cssupport@holibuddy.com';
    assert.equal(res.statusCode, 200);
    assert.equal(sent.url, `https://formsubmit.co/ajax/${expected}`);
    assert.equal(sent.payload._replyto, 'test@example.com');
    assert.equal(sent.payload._cc, undefined);
    assert.equal(sent.payload.to, undefined);
    assert.equal(sent.payload['Şirket'], category === 'partnership' ? 'Example Company' : undefined);
    assert.equal(sent.payload._url, 'https://holibuddy.com/iletisim');
  }
});
test('does not claim delivery when a mailbox still requires activation', async () => {
  for (const success of [true, 'true', false]) {
    const { res } = await run(request(), { success, message: 'This form needs Activation. Please confirm your email.' });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, 'DELIVERY_PENDING_ACTIVATION');
  }
});
test('does not claim delivery for provider rejection, false success or network failure', async () => {
  for (const [body, status] of [[{ success: true }, 500], [{ success: 'false' }, 200], [new Error('timeout'), 200]]) {
    const { res } = await run(request(), body, status);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.ok, false);
  }
});
test('rejects invalid inputs before contacting the provider', async () => {
  for (const bad of [{ category: '__proto__' }, { category: 'invalid' }, { email: 'bad\r\nBcc:other@example.com' }, { name: { value: 'x' } }, { message: 'short' }, { message: 'a'.repeat(5001) }, { website: 'bot' }, { phone: 'not-a-number' }]) {
    const req = request(); req.body = { ...req.body, ...bad };
    const { res, sent } = await run(req);
    assert.equal(res.statusCode, 400);
    assert.equal(sent, undefined);
  }
});
test('enforces request method, origin, content type and size', async () => {
  for (const [overrides, expected] of [[{ method: 'GET' }, 405], [{ headers: { origin: 'https://evil.example', 'content-type': 'application/json' } }, 403], [{ headers: { origin: 'https://holibuddy.com', 'content-type': 'text/plain' } }, 415], [{ headers: { origin: 'https://holibuddy.com', 'content-type': 'application/json', 'content-length': '25000' } }, 413], [{ body: '{broken' }, 400]]) {
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
