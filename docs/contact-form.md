# HoliBuddy contact form

The public form is `/iletisim`; the homepage and privacy-page footers link to it.
`api/contact.js` forwards validated messages to FormSubmit's documented AJAX endpoint.
No SMTP password or API key is placed in the browser or repository.

| Category value | Display label | Fixed recipient |
| --- | --- | --- |
| reservation | Rezervasyon | cssupport@holibuddy.com |
| aftersales | Satış sonrası | cssupport@holibuddy.com |
| partnership | Partnerlik | info@holibuddy.com |
| other | Diğer | cssupport@holibuddy.com |

The backend ignores client-supplied recipient, CC, subject and provider settings.
The visitor's validated email is the reply-to address. There are no attachments or automatic replies to visitors.

## Recipient activation

FormSubmit requires each receiving address to confirm the form. The first valid
submission sends an activation email to the relevant recipient. The mailbox owner
must verify the form URL `https://holibuddy.com/iletisim` and activate that form.
Check both inboxes and spam folders. After activation, submit one clearly labelled
test to each recipient and verify actual receipt, including a reply-to check.

An accepted provider request is not proof of delivery to the inbox. Activation
responses, failed upstream requests and timeouts must never display a success
state. On failure the form preserves entered data and offers an explicit mailto
draft link. FormSubmit documents retaining pending submissions for 30 days and
forwarding them after activation; avoid repeatedly submitting the same real request.

## Validation and abuse handling

Only POST JSON requests from `https://holibuddy.com` or `https://www.holibuddy.com`
are accepted. Fields have length/type checks and the payload is limited to 24 KB.
The server has a honeypot check and a best-effort limit of five requests per IP hash
per 15 minutes within a warm function instance. This is not a distributed limiter;
FormSubmit also performs spam filtering. Do not describe the local limit as a
global guarantee. Provider responses and form contents are not logged.

FormSubmit is disclosed in the form notice and privacy page. Its documented
30-day submission retention is separate from retention of received company email.
Review actual provider processing and international-transfer arrangements with
the company before treating the privacy documentation as a complete compliance review.

## Checks

Run `node --test test/contact.test.cjs`. Tests use a stub provider and send no email.
They cover all recipient routes, recipient-injection resistance, activation and
failure handling, request validation and the per-instance throttle.

## References

- https://formsubmit.co/documentation
- https://formsubmit.co/ajax-documentation
- https://formsubmit.co/help
