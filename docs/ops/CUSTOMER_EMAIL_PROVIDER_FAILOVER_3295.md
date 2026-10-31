# GeoMacro free transactional OTP: provider-account failover (Issue #3295)

This is a provider-router foundation, **not live customer OTP/login acceptance**. No email API key is currently proven configured. No provider API or customer funds are called by the offline tests.

## Quota-aware providers, in order

1. Resend Free: 3,000/mo and 100/day (soft app cap: 2,700/mo, 90/day). `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`.
2. Brevo Free: 300/day after approval (soft app cap: 270/day). `BREVO_EMAIL_API_KEY`, `BREVO_EMAIL_FROM_ADDRESS`.
3. MailerSend Free: 500/mo; daily API quota applies (soft app cap: 450/mo, 80/day). `MAILERSEND_EMAIL_API_KEY`, `MAILERSEND_EMAIL_FROM_ADDRESS`. Provider approval and verification required.

**Separate provider accounts**, not multiple keys/accounts created to bypass an individual provider's quota. Keep each provider account in good standing and adhere to its fair-use/anti-abuse policy. These allowances are caps, not guaranteed deliverability. Provider billing/country eligibility must be verified directly. Configure only providers whose sender domain is independently verified. The implementation explicitly requires `@geomacro.live` sender addresses; DNS SPF/DKIM/DMARC must match the provider.

## Behavior

`sendOtpWithProviderFailover` in `workers/control-plane/src/customer-email-provider-failover.mjs` uses D1 atomic `INSERT ... SELECT` reservations under `customer_email_dispatch_attempts`. It counts account-level attempted sends, not API-key usage, and moves to the next configured provider only when:
- local daily or monthly soft quota is exhausted, OR
- provider definitively rejects the message with HTTP 429 (or MailerSend documented monthly-cap `MS42242`).

Provider 200/201/202 acceptance **with message ID** stops further submissions. Missing credentials/verified From, HTTP 401/403/400, unclassified 422, network timeout, response 5xx or a missing acceptance receipt fail closed without trying a second provider. Ambiguous results are marked `unknown`, and replay on the same challenge is blocked so duplicate OTPs are not generated. No OTP or recipient email is stored in the provider-dispatch table, only opaque challenge IDs and provider receipt identifiers.

The `0092` migration separately prepares hashed D1 OTP challenges, send-event rate data, and single-use session ID binding. Neither migration creates free credits or valid customer accounts.

## Production enablement NOT YET ACCEPTED

- Verify each sending domain and add the selected server-only API keys in approved Cloudflare Worker configuration; **never** use `VITE_` or paste keys into GitHub comments.
- Create D1 OTP start/verify and session adapter, add persistent login/OTP brute-force and per-address/IP request admission, ensure unique/immutable challenge issuance and single-use redemption, and verify customer account parity.
- Hook the customer SSR routes to the protected D1 Worker, not Supabase; check cross-account keys and paid entitlements. Fail closed if no credentials.
- Deploy secrets and run two real owner-inbox deliverability checks with observable provider acceptance and delivery events; test safe failover with a controlled quota simulation.
- Only then switch an explicit customer-specific canonical runtime flag; do not change global Supabase mode, PREDGE or payment-approval locks.

**The absence of provider credentials prevents claiming that automatic quota failover is live.**
