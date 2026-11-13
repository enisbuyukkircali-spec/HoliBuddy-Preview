const { createHash } = require('node:crypto');
const nodemailer = require('nodemailer');

const ROUTES = Object.freeze({
  reservation: { label: 'Rezervasyon', to: 'cssupport@holibuddy.com' },
  aftersales: { label: 'Satış sonrası', to: 'cssupport@holibuddy.com' },
  partnership: { label: 'Partnerlik', to: 'info@holibuddy.com' },
  other: { label: 'Diğer', to: 'cssupport@holibuddy.com' }
});
const ORIGINS = new Set(['https://holibuddy.com', 'https://www.holibuddy.com']);
const WINDOW_MS = 15 * 60 * 1000;
const limits = new Map();
// Best-effort per-instance throttle, not a distributed abuse limit.
function limited(req) {
  const now = Date.now();
  for (const [key, entry] of limits) if (entry.until <= now) limits.delete(key);
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const key = createHash('sha256').update(ip).digest('hex');
  const entry = limits.get(key) || { count: 0, until: now + WINDOW_MS };
  if (entry.count >= 5 || (limits.size >= 2000 && !limits.has(key))) return true;
  entry.count++;
  limits.set(key, entry);
  return false;
}
function reply(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
}
function field(body, key, min, max, multiline = false) {
  const raw = body[key] === undefined ? '' : body[key];
  if (typeof raw !== 'string') throw new Error(key);
  const value = raw.trim();
  if (value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (!multiline && /[\r\n]/.test(value))) throw new Error(key);
  return value;
}
module.exports = async function contact(req, res) {
  const configured = process.env.CONTACT_EMAIL_ENABLED === 'true' &&
    ['CONTACT_SMTP_HOST', 'CONTACT_SMTP_USER', 'CONTACT_SMTP_PASSWORD', 'CONTACT_FROM_EMAIL'].every(key => Boolean(process.env[key])) &&
    [465, 587].includes(Number(process.env.CONTACT_SMTP_PORT || 587));
  if (req.method === 'GET') return reply(res, 200, { mode: configured ? 'smtp' : 'email-draft' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return reply(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  }
  if (!ORIGINS.has(req.headers.origin)) return reply(res, 403, { ok: false, code: 'INVALID_ORIGIN' });
  if (!/^application\/json(?:;|$)/i.test(String(req.headers['content-type'] || ''))) return reply(res, 415, { ok: false, code: 'INVALID_CONTENT_TYPE' });
  if (Number(req.headers['content-length'] || 0) > 24000) return reply(res, 413, { ok: false, code: 'BODY_TOO_LARGE' });
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 24000) throw new Error('body');
  } catch { return reply(res, 400, { ok: false, code: 'INVALID_REQUEST' }); }
  if (body.website) return reply(res, 400, { ok: false, code: 'INVALID_REQUEST' });
  let data, route;
  try {
    const category = field(body, 'category', 1, 30);
    if (!Object.hasOwn(ROUTES, category)) throw new Error('category');
    route = ROUTES[category];
    data = {
      name: field(body, 'name', 2, 100),
      email: field(body, 'email', 3, 254),
      phone: field(body, 'phone', 0, 30),
      reference: field(body, 'reference', 0, 80),
      company: category === 'partnership' ? field(body, 'company', 0, 160) : '',
      message: field(body, 'message', 10, 5000, true)
    };
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email)) throw new Error('email');
    if (data.phone && !/^[+()\d\s.-]{6,30}$/.test(data.phone)) throw new Error('phone');
  } catch (error) { return reply(res, 400, { ok: false, code: 'VALIDATION_ERROR', field: error.message }); }
  if (!configured) return reply(res, 503, { ok: false, code: 'DELIVERY_NOT_CONFIGURED' });
  if (limited(req)) {
    res.setHeader('Retry-After', '900');
    return reply(res, 429, { ok: false, code: 'RATE_LIMITED' });
  }
  try {
    const port = Number(process.env.CONTACT_SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: process.env.CONTACT_SMTP_HOST, port,
      secure: port === 465, requireTLS: true,
      auth: { user: process.env.CONTACT_SMTP_USER, pass: process.env.CONTACT_SMTP_PASSWORD },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      logger: false, debug: false,
      disableFileAccess: true, disableUrlAccess: true
    });
    const result = await transport.sendMail({
      from: { name: 'HoliBuddy İletişim', address: process.env.CONTACT_FROM_EMAIL },
      to: route.to, replyTo: { name: data.name, address: data.email },
      subject: `HoliBuddy | ${route.label} talebi`,
      text: `Talep türü: ${route.label}\nAd soyad: ${data.name}\nE-posta: ${data.email}\nTelefon: ${data.phone || 'Belirtilmedi'}\nRezervasyon numarası: ${data.reference || 'Belirtilmedi'}\n${data.company ? 'Şirket: ' + data.company + '\n' : ''}\n${data.message}`
    });
    if (!result.accepted?.some(address => String(address).toLowerCase() === route.to) || result.rejected?.length) return reply(res, 502, { ok: false, code: 'DELIVERY_UNAVAILABLE' });
    return reply(res, 200, { ok: true, recipient: route.to });
  } catch {
    // Never report success or log personal form content when delivery is uncertain.
    return reply(res, 502, { ok: false, code: 'DELIVERY_UNAVAILABLE' });
  }
};
