const API_BASE = "https://cr-b2b.enyugun.com";
const LANGUAGES = new Set(["tr", "en", "de", "ru", "es", "ar"]);
let cachedToken = "";
let tokenExpiresAt = 0;

const send = (res, status, body, cache = "no-store") => {
  res.setHeader("Cache-Control", cache);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
};

const readBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
};

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    return await fetch(API_BASE + path, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function login(force = false) {
  const username = process.env.ENUYGUN_API_USERNAME;
  const password = process.env.ENUYGUN_API_PASSWORD;
  if (!username || !password) throw Object.assign(new Error("Enuygun API credentials are not configured."), { code: "ENUYGUN_NOT_CONFIGURED" });
  if (!force && cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;

  const response = await request("/api/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password })
  });
  const result = await response.json().catch(() => ({}));
  const token = result?.data?.token;
  if (!response.ok || !token) {
    const error = new Error(result?.userMessage || result?.message || "Enuygun API login failed.");
    error.httpStatus = response.status;
    error.code = result?.code || "ENUYGUN_LOGIN_FAILED";
    throw error;
  }
  cachedToken = token;
  const expires = result?.data?.expires_at ? Date.parse(result.data.expires_at) : NaN;
  tokenExpiresAt = Number.isFinite(expires) ? expires : Date.now() + 23 * 60 * 60 * 1000;
  return cachedToken;
}

async function authorizedRequest(path, init = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await login(attempt > 0);
    const response = await request(path, {
      ...init,
      headers: { Accept: "application/json", ...(init.headers || {}), Authorization: "Bearer " + token }
    });
    const result = await response.json().catch(() => ({}));
    const expired = response.status === 401 && String(result?.code || "") === "6004";
    if (expired && attempt === 0) {
      cachedToken = "";
      tokenExpiresAt = 0;
      continue;
    }
    return { response, result };
  }
  throw new Error("Enuygun API authorization failed.");
}

module.exports = async function handler(req, res) {
  const action = String(req.query?.action || "");
  if (action === "status" && req.method === "GET") {
    const configured = Boolean(process.env.ENUYGUN_API_USERNAME && process.env.ENUYGUN_API_PASSWORD);
    return send(res, 200, { configured, provider: "Enuygun" });
  }
  if (action === "locations" && req.method === "GET") {
    const language = String(req.query?.language || "tr").toLowerCase();
    if (!LANGUAGES.has(language)) return send(res, 400, { error: "Unsupported language." });
    try {
      const { response, result } = await authorizedRequest("/api/v1/location-list?language=" + encodeURIComponent(language));
      if (!response.ok) return send(res, response.status, { error: result?.userMessage || result?.message || "Location list is unavailable.", code: result?.code || "ENUYGUN_API_ERROR" });
      return send(res, 200, result, "public, s-maxage=86400, stale-while-revalidate=3600");
    } catch (error) {
      if (error.code === "ENUYGUN_NOT_CONFIGURED") return send(res, 503, { error: "Enuygun API credentials are not configured.", code: error.code });
      return send(res, error.httpStatus || 502, { error: error.message || "Enuygun API is temporarily unavailable.", code: error.code || "ENUYGUN_UPSTREAM_ERROR" });
    }
  }
  if (action === "search" && req.method === "POST") {
    const body = await readBody(req);
    if (!body) return send(res, 400, { error: "A JSON request body is required." });
    const language = String(body.language || "tr").toLowerCase();
    const currency = String(body.currency || "").toUpperCase();
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const key of ["pickupDate", "dropOffDate"]) if (!datePattern.test(String(body[key] || ""))) return send(res, 400, { error: key + " must use YYYY-MM-DD." });
    for (const key of ["pickupTime", "dropOffTime"]) if (!timePattern.test(String(body[key] || ""))) return send(res, 400, { error: key + " must use HH:mm." });
    for (const key of ["pickupLocation", "dropOffLocation"]) if (typeof body[key] !== "string" || !body[key].trim()) return send(res, 400, { error: key + " must be an Enuygun location slug." });
    if (!LANGUAGES.has(language)) return send(res, 400, { error: "Unsupported language." });
    if (!/^[A-Z]{3}$/.test(currency)) return send(res, 400, { error: "A three-letter currency code is required." });
    const pickup = new Date(body.pickupDate + "T" + body.pickupTime + ":00");
    const dropOff = new Date(body.dropOffDate + "T" + body.dropOffTime + ":00");
    if (!Number.isFinite(pickup.getTime()) || !Number.isFinite(dropOff.getTime()) || dropOff <= pickup) return send(res, 400, { error: "Drop-off must be after pickup." });

    const payload = {
      pickupDate: body.pickupDate,
      pickupTime: body.pickupTime,
      dropOffDate: body.dropOffDate,
      dropOffTime: body.dropOffTime,
      pickupLocation: body.pickupLocation.trim(),
      dropOffLocation: body.dropOffLocation.trim(),
      currency,
      language
    };
    if (body.saleType === "corporate") payload.saleType = "corporate";

    try {
      const { response, result } = await authorizedRequest("/api/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) return send(res, response.status, { error: result?.userMessage || result?.message || "Enuygun search failed.", code: result?.code || "ENUYGUN_API_ERROR" });
      return send(res, 200, result);
    } catch (error) {
      if (error.code === "ENUYGUN_NOT_CONFIGURED") return send(res, 503, { error: "Enuygun API credentials are not configured.", code: error.code });
      return send(res, error.httpStatus || 502, { error: error.message || "Enuygun API is temporarily unavailable.", code: error.code || "ENUYGUN_UPSTREAM_ERROR" });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return send(res, 405, { error: "Unsupported Enuygun API operation." });
};
