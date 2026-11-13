# HoliBuddy contact form

The public page is `/iletisim`; homepage and privacy-page footers link to it.

| Category value | Display label | Fixed recipient |
| --- | --- | --- |
| reservation | Rezervasyon | cssupport@holibuddy.com |
| aftersales | Satış sonrası | cssupport@holibuddy.com |
| partnership | Partnerlik | info@holibuddy.com |
| other | Diğer | cssupport@holibuddy.com |

## Current delivery status

No email credentials are configured in Vercel. The live form currently prepares an
email draft in the visitor's browser. The visitor must open the draft and send it
from their email application. It does not claim that preparing the draft sends it.
No form body is POSTed to our API in draft mode. `GET /api/contact` returns only the
current mode, never settings or secrets.

A FormSubmit integration was tried on 2026-11-13. The live support test did not
return delivery success. A separate synthetic partnership test was explicitly
rejected by the provider's Cloudflare security with error 1010. No inbox receipt
was verified. The integration has been removed; do not bypass provider security
or tell the owner that activating FormSubmit is sufficient.

## Enable direct SMTP delivery

First identify the existing email provider and confirm both recipient mailboxes
exist. Use that provider's supported SMTP submission credentials. Some providers
require OAuth, an app password or a relay service; do not disable account security.
If OAuth is required, adapt the transport to that provider before enabling it.

Configure these server-side Vercel production environment variables:

| Variable | Meaning |
| --- | --- |
| CONTACT_SMTP_HOST | Provider's SMTP host |
| CONTACT_SMTP_PORT | 587 (STARTTLS) or 465 (TLS) |
| CONTACT_SMTP_USER | Authorized SMTP account |
| CONTACT_SMTP_PASSWORD | Provider-issued SMTP/app password, stored as sensitive |
| CONTACT_FROM_EMAIL | Sender address authorized by the provider |
| CONTACT_EMAIL_ENABLED | `true` after setup; otherwise draft mode |

Never put passwords or API keys in the repository, browser code, or screenshots.
Redeploy after changing environment variables. Verify authentication with
Nodemailer's `transport.verify()` without sending; then send one clearly labelled
synthetic test per recipient and confirm actual inbox receipt and reply-to behavior.
An SMTP acceptance response is not proof of arrival in an inbox.

## Behavior and checks

The server, not the visitor, selects the recipient from the four allowed categories.
Visitor email is Reply-To, never From. No attachments or automatic replies are sent.
SMTP requires TLS with certificate verification; network timeouts are bounded.
Provider responses, message bodies and credentials are not logged.

POST requests require JSON and the exact HoliBuddy origin. Fields have type/length
validation, a 24 KB payload limit and a honeypot. The five-per-15-minute IP hash
throttle is per warm function instance, not a distributed limit. Assess a durable
limiter when enabling direct delivery for higher traffic.

Failures preserve form data and offer an explicit mailto draft. Preparing a draft
never displays the sent-success state. SMTP success requires the chosen recipient
to be accepted and no rejected recipients.

Run `npm ci --ignore-scripts` and `npm test` for routing, injection, TLS configuration,
unconfigured mode, rejection, validation and throttling tests. UI checks cover all
four category choices, conditional company/reference fields, draft routing and
mobile layout. The privacy notice describes email providers without inventing an
unconfirmed provider or retention period.
