const { fetch, ProxyAgent } = require("undici");

function proxyOptions(value) {
  try {
    const url = new URL(value);
    // Fixie provides an HTTP URL by default; its TLS listener uses the same IPs.
    if (url.protocol === "http:" && url.hostname.endsWith(".usefixie.com") && !url.port) {
      url.protocol = "https:";
      url.port = "443";
    }
    if (url.protocol !== "https:" || !url.username || !url.password ||
        url.pathname !== "/" || url.search || url.hash) throw new Error();
    const credentials = decodeURIComponent(url.username) + ":" + decodeURIComponent(url.password);
    return {
      uri: url.origin,
      token: "Basic " + Buffer.from(credentials).toString("base64"),
      requestTls: { rejectUnauthorized: true },
      proxyTls: { rejectUnauthorized: true }
    };
  } catch {
    throw Object.assign(new Error("The Enuygun proxy configuration is invalid."), {
      code: "ENUYGUN_PROXY_CONFIG_ERROR"
    });
  }
}

function createRequest(baseUrl, { proxyUrl, timeoutMs = 40000 } = {}) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:") throw new Error("Enuygun requires HTTPS.");
  let dispatcher;
  const request = async (path, options = {}) => {
    const target = new URL(path, base);
    if (target.origin !== base.origin) throw new Error("Invalid Enuygun endpoint.");
    // Validate lazily so the status endpoint remains available if configuration is bad.
    // A configured but broken proxy must never fall back to a dynamic outbound IP.
    if (proxyUrl !== undefined && !dispatcher) dispatcher = new ProxyAgent(proxyOptions(proxyUrl));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(target, {
        ...options,
        dispatcher,
        redirect: "error",
        signal: controller.signal
      });
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { result = {}; }
      return { response, result };
    } catch (cause) {
      // Never expose a proxy URL, credentials, or arbitrary library error text.
      const code = String(cause?.cause?.code || cause?.code || "");
      throw Object.assign(new Error("Enuygun API connection failed."), {
        code: "ENUYGUN_TRANSPORT_ERROR",
        cause: { code: /^[A-Z0-9_]{1,40}$/.test(code) ? code : undefined }
      });
    } finally {
      clearTimeout(timeout);
    }
  };
  request.close = async () => { if (dispatcher) await dispatcher.close(); };
  return request;
}

module.exports = { createRequest, proxyOptions };
