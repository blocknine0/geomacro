# Issue #3295 — P0-1 customer D1 backend

## Scope and status

Code-only preparation. No publication, remote migration, email dispatch, payment,
funding, source-rights change, PREDGE action or production acceptance is performed.
The customer SSR endpoints no longer use retired Auth/PostgREST or paid RPCs.
Only the dedicated D1 customer Worker authenticates sessions and owns accounts.
Existing public pages and commercial API authorization are unchanged.

Key creation is **unconditionally disabled** with
`CUSTOMER_D1_COMMERCIAL_AUTH_NOT_MIGRATED`. There is no configuration override.
Actual commercial bearer resolution/credit consumption still uses the legacy
commercial RPC path; D1 keys cannot safely be advertised as usable. D1's existing
funded-only, three-key and 60-second cooldown triggers remain intact. Key listing
and owner-scoped irreversible revocation operate only on D1 rows.

## Protected configuration (not set by this milestone)

- `GEOMACRO_CUSTOMER_WORKER_URL`: SSR-only canonical HTTPS origin of the existing
  control-plane Worker, without credentials, path, query or fragment.
- `GEOMACRO_CUSTOMER_SSR_TOKEN`: dedicated high-entropy shared token, at least
  64 characters, stored in both SSR and Worker protected settings. Never reuse
  browser, operator, commerce-ledger or source-access tokens. Use a password
  manager to create one value for both environments; do not commit or print it.
- `GEOMACRO_CUSTOMER_AUTH_PEPPER`: independent high-entropy Worker-only secret,
  at least 64 characters. HMAC namespaces isolate OTP, identity, IP and session.
  Rotation invalidates outstanding OTPs and sessions; plan it explicitly.
- `GEOMACRO_CUSTOMER_ALLOWED_ORIGINS`: Worker exact comma-separated HTTPS origins
  for authorized website hosts; no wildcard, localhost or arbitrary preview host.
- `GEOMACRO_CUSTOMER_TRUSTED_EDGE=cloudflare`: SSR-only attestation set **only
  after verifying** the hosting ingress overwrites/removes attacker-supplied
  `CF-Connecting-IP`. Missing trusted IP metadata fails closed. Do not use
  X-Forwarded-For or browser JSON as an IP authority. If hosting cannot guarantee
  this boundary, keep OTP unavailable until a trusted ingress adapter is added.
- Existing email-provider account credentials and independently verified
  `@geomacro.live` sender settings: `EMAIL_PROVIDER_API_KEY`,
  `EMAIL_FROM_ADDRESS`, `BREVO_EMAIL_API_KEY`, `BREVO_EMAIL_FROM_ADDRESS`,
  `MAILERSEND_EMAIL_API_KEY`, `MAILERSEND_EMAIL_FROM_ADDRESS`. Existing quota
  failover is reused unchanged; no subscription or quota expansion is required.

The Worker requires its existing canonical `DB` binding. Missing configuration,
missing schema or an unavailable Worker never activates a fallback database.

## Migration application — separate authorized operation

No migration has been applied remotely. Verify the intended Worker account and
canonical DB binding before using the repository's existing D1 migration process.
Apply 0090, 0091, 0092, 0093, then new **0094_customer_login_runtime.sql** exactly
once in migration order. Do not send SQLite/D1 migrations to historical databases
or the hosting database. 0094 adds generation-specific challenges because 0092's
unique email and session FK make destructive challenge replacement unsafe.
Keep 0092 records for reproducibility; the new runtime does not read them.

OTP lifetime is 10 minutes, six digits, five attempts. Identity sends: three per
15 minutes and a 60-second cooldown; IP sends: ten per 15 minutes. Verification:
ten per identity and thirty per IP per 15 minutes. Reservations are atomic D1
INSERT/SELECT statements, including unsuccessful dispatches. Provider ambiguity
does not cause another send. Only a persisted accepted dispatch permits login.
Session lifetime is one hour; cookies are `__Host-gm_customer`, HttpOnly, Secure,
SameSite=Strict, host-only. HMAC-only persistence; logout revokes server-side.

Verification consumes a challenge and creates a verified user/session in one D1
transactional batch. A unique session/challenge index and insert trigger enforce
single use. Failed or suspended-user attempts cannot create a session. A lost
response is not replayed into a second session; request a new code after cooldown.

## Offline checks

```sh
node --test scripts/tests/customer-runtime.test.mjs scripts/tests/customer-canonical-d1-schema.test.mjs scripts/tests/customer-email-provider-failover.test.mjs
bunx vitest run src/lib/customer-self-service.server.test.ts
```

Fixtures use in-memory SQLite and fake providers only. Synthetic funding fixtures
test existing trigger denials, never create production credits. SQLite tests
establish SQL invariants but do not prove deployed D1 isolation/ingress behavior.
Build/typecheck is performed by the hosting validation harness, not manually.

## Later no-funds readback (not authorized or run here)

After canonical GitHub review, separate authorized migration/configuration and
deployment, verify the actual public SHA and Worker revision before acceptance.
Validate unauthenticated private routes deny access, spoofed origin/token/IP
fails, and an authorized real mailbox receives one code. Never capture OTPs,
cookies or private headers in logs/screenshots. Verify one session for concurrent
correct verification, expiry, wrong-code limits, server logout and owner isolation.
Account must show zero new credits, no checkout and disabled key creation.
Read counts for receipts, grants, credit ledger and API keys before/after: unchanged.
No merchant, settlement, paid source or paid API call belongs in this acceptance.

## Remaining gates

1. Deliver the scoped diff through canonical GitHub PR/main. This checkout's
   remotes are hosting-only; no GitHub reconnection or push is performed.
2. Independently authorize/apply D1 migration and protected configuration, verify
   trusted IP ingress, then separately deploy and perform real no-funds readback.
3. Before enabling keys, migrate reviewed commercial bearer authorization and
   atomic credit consumption to D1, verify `commercial-bearer` HMAC compatibility
   with the exact existing `geomacro-api-credential-v1` namespace/pepper, and add
   funded concurrency/idempotency acceptance. No key enablement in this milestone.
4. Establish bounded retention/deletion for expired login/send/verify records in
   a separately reviewed customer maintenance operation; existing source and
   publisher schedules are intentionally untouched here.