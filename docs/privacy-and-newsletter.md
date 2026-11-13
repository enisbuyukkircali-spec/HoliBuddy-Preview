# HoliBuddy privacy release — 14 November 2026

## Implemented

- Every served HTML page (including older design URLs) loads the same self-hosted
  preference manager before application scripts. The redirect-only holibuddy.html
  goes to home. No third-party CMP is loaded.
- Optional persistent language/currency reads and writes use the manager. No consent
  means page-memory-only values; query parameters still carry the current selection
  through a reservation flow. Existing unconsented preference keys are removed.
- Accept, reject and manage have equal prominence. Only the actual optional purpose
  (remembering language/currency) is offered. No analytics/ad tools are installed,
  so neither category can be enabled by accepting this version.
- Versioned choice lasts 180 days. Revocation removes language/currency keys;
  expiration and version mismatch require a new choice. Cross-tab changes are
  observed. Storage-disabled browsers retain only current-page state.
- `hb-fx` moved from persistent storage to sessionStorage. It contains public rate
  data. The duplicate-reservation guard remains sessionStorage. User-saved account
  data remains separate; cookie rejection does not delete that data.
- Cookies, KVKK and commercial-email information pages share existing branding.
  The privacy notice is updated to the actual inventory. Login copy no longer
  treats continuing as agreeing to privacy/marketing; checkout/contact link to
  information independently of contractual acceptance.

The consent record is browser-local, not a server evidence database. Do not claim
central consent audit logging or automatic IYS registration. No GA, GTM, Meta or
other trackers should be added without updating the inventory, purpose-specific
controls, prior-execution gating, evidence design and consent version. Serving an
external image or script can still reveal technical connection information; this
release does not claim that all network traffic is first-party.

## Newsletter status: OFF

The owner confirmed that there is no IYS service-provider/brand registration yet.
No subscriber collection form, promotional email job or IYS API call was activated.
`config/newsletter-consent.json` is the prepared text contract for the future
newsletter UI, not a permission database. Both independent choices default off.
Loading the file or the legal page never gives consent.

Before enabling the requested future newsletter:

1. Company signatory completes IYS provider/brand registration using verified
   MERSIS/company details. Follow the official application requirements; do not
   invent a provider/brand ID or represent a website checkbox as an IYS entry.
2. Choose the actual email provider and IYS-authorized integration route. Identify
   processors, storage region, retention and any KVKK art.9 transfer mechanism.
   Confirm the company's postal/KEP details for the notices.
3. Implement a durable, access-controlled consent ledger: normalized email,
   channel, each separate choice, exact wording/version, source, timestamp,
   verification event and IYS synchronization result. Never log raw credentials.
   Define retention against the applicable legislation before collection begins.
4. Use a neutral double opt-in email to verify address ownership. Verification must
   not silently opt users into unrelated channels or purposes. A clicked box alone
   is not enough to mark an IYS synchronization as successful.
5. Keep subscriptions pending until verification, the required separate permissions
   and IYS approval recording are complete. Reconcile external IYS opt-outs and
   deny marketing sends whenever permission state is unavailable or unsynchronized.
6. Add easy free unsubscribe in every commercial email, without login. Use opaque,
   limited-purpose tokens, immediate local suppression, idempotent processing and
   timely IYS synchronization. Do not put raw email addresses into tracking links.
7. Test the real unsubscribe and rejection flows before turning `enabled` on.
   Transactional reservation/support messages must remain separate from marketing.

IYS states that external approval/rejection records must be synchronized within
three working days, and refusal must stop commercial messages within that period.
Local suppression should be immediate. Do not send promotions while retries await
synchronization. Retain required evidence without continuing marketing processing
once consent has been withdrawn.

## Outstanding organizational work

Website text and controls do not complete IYS account registration, VERBIS
assessment, processor agreements, or KVKK international-transfer arrangements.
Those depend on actual company/provider information. This release does not state
that these formal processes are complete. The bülten feature remains off.

## Sources checked

- https://www.rentalcars.com/tr/privacy-policy (structure reference only; not copied)
- https://www.kvkk.gov.tr/Icerik/7353/Cerez-Uygulamalari-Hakkinda-Rehber
- https://www.kvkk.gov.tr/Icerik/7765/2023-1645
- https://www.kvkk.gov.tr/Icerik/2037/Acik-Riza-Alirken-Dikkat-Edilecek-Hususlar
- https://www.kvkk.gov.tr/Icerik/8710/veri-sorumlulari-tarafindan-acik-riza-ve-aydinlatma-metinlerinin-ayri-ayri-duzenlenmesi-gerektigi-hakkinda-kisisel-verileri-koruma-kurulunun-18-02-2026-tarihli-ve-2026-347-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu
- https://www.kvkk.gov.tr/Icerik/2046/Ilgili-Kisiler-Tarafindan-Yapilan-Basvurularin-Cevaplanmasi-Yukumlulugu
- https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim
- https://iys.org.tr/iys/sss
- https://iys.org.tr/hizmet-saglayici/basvuru/nasil-yapilir
- https://ticaret.gov.tr/haberler/entegratorluk-yetkisi-basin-aciklamasi
