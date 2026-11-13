# Enuygun fixed outbound IP setup

The server-side Enuygun client uses `FIXIE_URL` when it is configured. Without
this environment variable it retains the existing direct connection behavior.
Invalid settings or proxy failures never fall back to a direct connection.

## Activate

1. Complete provisioning of the approved Fixie HTTP/HTTPS proxy for
   `holibuddy-preview`. Verify its selected plan and any checkout terms first.
2. Confirm the integration creates `FIXIE_URL` for Production and Preview.
   Keep this secret server-side; never commit its value or use a public prefix.
3. Obtain both assigned outbound IP addresses from the Fixie resource and have
   Enuygun allowlist both. Domain DNS addresses are not outbound proxy IPs.
4. Deploy this change and verify login, locations, and one search through the
   deployed API. Do not create a booking as a connectivity test.

Fixie's default HTTP proxy URL is upgraded to its HTTPS listener on port 443.
Destination and proxy certificates are both verified. Certificate failures must
be investigated with the provider; do not disable TLS validation. The entire
response has a 40-second timeout, redirects are rejected, and transport failures
do not trigger a retry that could duplicate a booking.

## Local verification

Run `npm ci --ignore-scripts` then `npm test` with Node 24 and OpenSSL installed.
Tests generate temporary local TLS certificates, run a real CONNECT proxy, and
verify credential isolation, certificate checks, failure behavior, response
timeouts, and the API's token-refresh handling. No live Enuygun credentials or
reservations are used. Test certificates are deleted when the runner finishes.
