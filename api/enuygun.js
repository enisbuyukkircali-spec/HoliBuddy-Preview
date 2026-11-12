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

    const driverAge = Number(body.driverAge ?? 30);
    if (!Number.isInteger(driverAge) || driverAge < 18 || driverAge > 99) return send(res, 400, { error: "driverAge must be a valid age." });
    const payload = {
      pickupDate: body.pickupDate,
      pickupTime: body.pickupTime,
      dropOffDate: body.dropOffDate,
      dropOffTime: body.dropOffTime,
      pickupLocation: body.pickupLocation.trim(),
      dropOffLocation: body.dropOffLocation.trim(),
      currency,
      driverAge,
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

  const postActions = new Set(["extras", "conditions", "read-reservation", "book"]);
  if (postActions.has(action) && req.method === "POST") {
    const body = await readBody(req);
    if (!body) return send(res, 400, { error: "A JSON request body is required." });
    for (const key of ["requestId", "referenceId"]) {
      if (typeof body[key] !== "string" || !body[key].trim() || body[key].length > 180) {
        return send(res, 400, { error: key + " is required." });
      }
    }
    const payload = { requestId: body.requestId.trim(), referenceId: body.referenceId.trim() };
    const language = String(body.language || "tr").toLowerCase();
    if (!LANGUAGES.has(language)) return send(res, 400, { error: "Unsupported language." });
    if (action === "extras" || action === "conditions") {
      payload.language = language;
      if (body.market) payload.market = String(body.market).slice(0, 8);
    }
    if (action === "book") {
      const contact = body.contact;
      if (!contact || typeof contact !== "object") return send(res, 400, { error: "Contact details are required." });
      const required = ["firstName", "lastName", "email", "phoneCountryCode", "phoneNumber", "birthDay"];
      for (const key of required) if (typeof contact[key] !== "string" || !contact[key].trim()) return send(res, 400, { error: key + " is required." });
      if (!/^\d{2}-\d{2}-\d{4}$/.test(contact.birthDay)) return send(res, 400, { error: "birthDay must use DD-MM-YYYY." });
      if (!contact.citizenNumber && !contact.passportNumber) return send(res, 400, { error: "A national ID or passport number is required." });
      if (contact.citizenNumber && !/^\d{11}$/.test(contact.citizenNumber)) return send(res, 400, { error: "National ID must contain 11 digits." });
      if (contact.passportNumber && !/^[A-Za-z0-9-]{4,24}$/.test(contact.passportNumber)) return send(res, 400, { error: "Passport number format is invalid." });
      payload.contact = Object.fromEntries(required.map(key => [key, contact[key].trim()]));
      payload.contact.phoneCountryCode = payload.contact.phoneCountryCode.startsWith("+") ? payload.contact.phoneCountryCode : "+" + payload.contact.phoneCountryCode;
      payload.contact.phoneNumber = payload.contact.phoneNumber.replace(/[^0-9]/g, "");
      if (contact.citizenNumber) payload.contact.citizenNumber = contact.citizenNumber;
      if (contact.passportNumber) payload.contact.passportNumber = contact.passportNumber;
      if (contact.flightNumber) payload.contact.flightNumber = String(contact.flightNumber).trim().slice(0, 32);
      if (Array.isArray(body.extraServices)) {
        if (body.extraServices.length > 30) return send(res, 400, { error: "Too many extra services." });
        payload.extraServices = [];
        for (const item of body.extraServices) {
          if (!item || typeof item.slug !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(item.slug) || !Number.isInteger(Number(item.count)) || Number(item.count) < 1 || Number(item.count) > 20) {
            return send(res, 400, { error: "An extra service selection is invalid." });
          }
          payload.extraServices.push({ slug: item.slug, count: Number(item.count) });
        }
      }
      if (body.invoice && typeof body.invoice === "object") payload.invoice = body.invoice;
      if (body.contractType) payload.contractType = String(body.contractType).slice(0, 80);
      if (body.brokerRezId) payload.brokerRezId = String(body.brokerRezId).slice(0, 100);
    }
    const endpoints = {
      extras: "/api/v1/extra-services",
      conditions: "/api/v1/rental-conditions",
      "read-reservation": "/api/v1/read-reservation",
      book: "/api/v1/book"
    };
    try {
      const { response, result } = await authorizedRequest(endpoints[action], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) return send(res, response.status, { error: result?.userMessage || result?.message || "Enuygun " + action + " failed.", code: result?.code || "ENUYGUN_API_ERROR" });
      return send(res, 200, result);
    } catch (error) {
      if (error.code === "ENUYGUN_NOT_CONFIGURED") return send(res, 503, { error: "Enuygun API credentials are not configured.", code: error.code });
      return send(res, error.httpStatus || 502, { error: error.message || "Enuygun API is temporarily unavailable.", code: error.code || "ENUYGUN_UPSTREAM_ERROR", verifyBeforeRetry: action === "book" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return send(res, 405, { error: "Unsupported Enuygun API operation." });
};
