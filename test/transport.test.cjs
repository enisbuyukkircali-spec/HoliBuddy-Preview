const { test } = require("node:test");
const assert = require("node:assert/strict");
const https = require("node:https");
const net = require("node:net");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createRequest, proxyOptions } = require("../lib/enuygun-transport");

const tls = name => ({
  key: readFileSync(join(process.env.HOLIBUDDY_TEST_TLS, name + ".key")),
  cert: readFileSync(join(process.env.HOLIBUDDY_TEST_TLS, name + ".crt"))
});
async function serve(t, handler, name = "trusted") {
  const server = https.createServer(tls(name), handler);
  const sockets = new Set();
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  return { server, url: "https://127.0.0.1:" + server.address().port };
}
async function proxy(t, target, { reject = false, name = "trusted" } = {}) {
  const fixture = await serve(t, (_, res) => res.end(), name);
  fixture.connects = [];
  fixture.server.on("connect", (req, socket, head) => {
    fixture.connects.push(req.headers);
    if (reject) return socket.end("HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n");
    const upstream = net.connect(new URL(target).port, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    socket.on("close", () => upstream.destroy());
    upstream.on("error", () => socket.destroy());
  });
  fixture.url = fixture.url.replace("https://", "https://proxy-user:proxy-secret@");
  return fixture;
}

test("upgrades Fixie to TLS and rejects unsafe or malformed proxy settings", () => {
  const options = proxyOptions("http://user:p%40ss@model.usefixie.com:80");
  assert.equal(options.uri, "https://model.usefixie.com");
  assert.equal(options.token, "Basic " + Buffer.from("user:p@ss").toString("base64"));
  assert.equal(options.requestTls.rejectUnauthorized, true);
  assert.equal(options.proxyTls.rejectUnauthorized, true);
  for (const value of ["", "private-secret", "http://user:secret@example.com", "https://example.com", "https://u:p@x/?secret=value"]) {
    assert.throws(() => proxyOptions(value), error => {
      assert.equal(error.code, "ENUYGUN_PROXY_CONFIG_ERROR");
      assert.doesNotMatch(error.message, /secret|value/);
      return true;
    });
  }
});

test("routes through CONNECT, keeps proxy credentials out of the destination, and reads JSON", async t => {
  let received;
  const target = await serve(t, (req, res) => {
    received = req.headers;
    res.setHeader("Content-Type", "application/json");
    res.end('{"data":{"offers":[1]}}');
  });
  const tunnel = await proxy(t, target.url);
  const request = createRequest(target.url, { proxyUrl: tunnel.url });
  t.after(() => request.close());
  const { response, result } = await request("/search", { headers: { Authorization: "Bearer test-api-token" } });
  assert.equal(response.status, 200);
  assert.deepEqual(result.data.offers, [1]);
  assert.equal(tunnel.connects.length, 1);
  assert.equal(tunnel.connects[0]["proxy-authorization"], "Basic " + Buffer.from("proxy-user:proxy-secret").toString("base64"));
  assert.equal(tunnel.connects[0].authorization, undefined);
  assert.equal(received["proxy-authorization"], undefined);
  assert.equal(received.authorization, "Bearer test-api-token");
});

test("a rejected proxy never falls back to direct requests or exposes credentials", async t => {
  let hits = 0;
  const target = await serve(t, (_, res) => { hits++; res.end("{}"); });
  const tunnel = await proxy(t, target.url, { reject: true });
  const request = createRequest(target.url, { proxyUrl: tunnel.url });
  t.after(() => request.close());
  await assert.rejects(request("/login"), error => {
    assert.equal(error.code, "ENUYGUN_TRANSPORT_ERROR");
    assert.doesNotMatch(error.message, /proxy-secret|proxy-user/);
    return true;
  });
  assert.equal(tunnel.connects.length, 1);
  assert.equal(hits, 0);
});

for (const untrusted of ["destination", "proxy"]) {
  test("rejects an untrusted " + untrusted + " certificate", async t => {
    let hits = 0;
    const target = await serve(t, (_, res) => { hits++; res.end("{}"); }, untrusted === "destination" ? "untrusted" : "trusted");
    const tunnel = await proxy(t, target.url, { name: untrusted === "proxy" ? "untrusted" : "trusted" });
    const request = createRequest(target.url, { proxyUrl: tunnel.url });
    t.after(() => request.close());
    await assert.rejects(request("/login"), error => {
      assert.equal(error.cause.code, "DEPTH_ZERO_SELF_SIGNED_CERT");
      return true;
    });
    assert.equal(hits, 0);
  });
}

test("blocks redirects without replaying an authenticated POST", async t => {
  let hits = 0;
  const target = await serve(t, (_, res) => { hits++; res.writeHead(307, { Location: "/next" }); res.end(); });
  const tunnel = await proxy(t, target.url);
  const request = createRequest(target.url, { proxyUrl: tunnel.url });
  t.after(() => request.close());
  await assert.rejects(request("/book", { method: "POST", body: "{}" }), { code: "ENUYGUN_TRANSPORT_ERROR" });
  assert.equal(hits, 1);
});

test("keeps the timeout active while receiving the response body", async t => {
  const target = await serve(t, (_, res) => { res.writeHead(200); res.write('{"data":'); });
  const tunnel = await proxy(t, target.url);
  const request = createRequest(target.url, { proxyUrl: tunnel.url, timeoutMs: 200 });
  t.after(() => request.close());
  await assert.rejects(request("/search"), { code: "ENUYGUN_TRANSPORT_ERROR" });
});

test("preserves direct requests when no proxy is configured", async t => {
  const target = await serve(t, (_, res) => res.end('{"direct":true}'));
  const request = createRequest(target.url);
  assert.deepEqual((await request("/locations")).result, { direct: true });
});

test("the API handler preserves login, expired-token retry, and response format", async t => {
  const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = require("undici");
  const previousDispatcher = getGlobalDispatcher();
  const envKeys = ["FIXIE_URL", "ENUYGUN_API_USERNAME", "ENUYGUN_API_PASSWORD"];
  const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  delete process.env.FIXIE_URL;
  process.env.ENUYGUN_API_USERNAME = "local-test-user";
  process.env.ENUYGUN_API_PASSWORD = "local-test-password";
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
  t.after(async () => {
    setGlobalDispatcher(previousDispatcher);
    await mock.close();
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });
  const pool = mock.get("https://cr-b2b.enyugun.com");
  pool.intercept({ path: "/api/v1/login", method: "POST" }).reply(200, { data: { token: "test-token-1" } });
  pool.intercept({ path: "/api/v1/location-list?language=tr", headers: { authorization: "Bearer test-token-1" } }).reply(401, { code: 6004 });
  pool.intercept({ path: "/api/v1/login", method: "POST" }).reply(200, { data: { token: "test-token-2" } });
  pool.intercept({ path: "/api/v1/location-list?language=tr", headers: { authorization: "Bearer test-token-2" } }).reply(200, { data: ["test-location"] });
  const handler = require("../api/enuygun");
  const res = {
    headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
  await handler({ method: "GET", query: { action: "locations" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { data: ["test-location"] });
  mock.assertNoPendingInterceptors();
});
