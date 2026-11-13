// Ephemeral local certificates let the tests verify TLS without disabling it.
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const dir = mkdtempSync(join(tmpdir(), "holibuddy-tls-"));
try {
  for (const name of ["trusted", "untrusted"]) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout", join(dir, name + ".key"), "-out", join(dir, name + ".crt")], { stdio: "ignore" });
  }
  const run = spawnSync(process.execPath, ["--test", "test/transport.test.cjs"], {
    stdio: "inherit", env: { ...process.env, HOLIBUDDY_TEST_TLS: dir,
      NODE_EXTRA_CA_CERTS: join(dir, "trusted.crt") }
  });
  process.exitCode = run.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
