# GeoMacro Part 1: coordinated commercial switch and leakage boundaries

## Scope

This change adds a central **request-time** incident gate to Nitro before request
authentication, distributed quotas, body decoding or application payment handlers.
It complements, rather than replaces, each provider's own settlement/quote
authorization, idempotency, exact-payment verification and durable ledger.

**Do not equate a source commit or configured environment variable with live
payment acceptance.** As of this implementation the public PayPal create/capture
handlers are intentionally locked, and per-provider production enablement remains
separate.

## Authorized launch configuration (server-side only)

```text
GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH
GEOMACRO_REAL_FUNDS_SECURITY_ACK=I_ACCEPT_REAL_FUNDS_SECURITY_GATES
GEOMACRO_CENTRAL_SECURITY_MODE=enforce
GEOMACRO_SECURITY_FINGERPRINT_PEPPER=<independently generated >=32-character secret>
GEOMACRO_API_CREDENTIAL_PEPPER=<different independently generated >=32-character secret>
GEOMACRO_COMMERCE_EMERGENCY_FREEZE=false
GEOMACRO_COMMERCE_DISABLED_PROVIDERS=
```

These are necessary checks, not sufficient conditions for mainnet payments.
Provider-specific credentials/ACKs, authoritative database security, real
settlement, ledger and controlled delivery must also be accepted.

Never check pepper values, key material or any production ACK values into
`.env.example`, CI output, issues, logs or browser bundles. Configure them
in the hosting provider's encrypted production secret store.

## Global emergency OFF

```text
GEOMACRO_COMMERCE_EMERGENCY_FREEZE=true
```

After deployment propagation, paid POST/PATCH/DELETE entry points covered by
`commercialEmergencyDecision` return an HTTP 423 with a no-store, no-charge
response **before** executing the payment handlers. Coverage includes
Coinbase/Circle/Nevermined x402 aliases, canonical intelligence POST and
category POSTs, paid structured-answer POST, payment creation/capture/verification
paths, risk-gate POST and the commercial structural POST. GOAT mainnet
routes are frozen; testnet and the free website/research/PREDGE pilot remain
independent. Explicit no-funds preflight, read-only discovery and OPTIONS are
left available.

**Important limitation:** Cloudflare Worker environment/secrets are
deployment-scoped. Updating an environment variable is not a guaranteed
one-second, globally atomic operation. Wait for propagation and independently
probe each production hostname and payment ingress before declaring OFF.
A true one-second SLO would require a separately deployed strongly consistent
runtime control service with fail-closed reads, plus operational latency tests.
In-flight settlements already accepted before the freeze require durable
reconciliation; freezing cannot reverse on-chain or PayPal captures.

## Selective provider isolation

```text
GEOMACRO_COMMERCE_DISABLED_PROVIDERS=paypal,coinbase_x402
```

The central boundary rejects explicit PayPal and Coinbase legacy x402 routes,
while allowing other eligible providers. The final settlement adapters already
enforce quarantine on canonical multi-provider endpoints, whose payment rail is
resolved from the signed payment rather than merely inferred from URL.
Never infer network choice from an untrusted client claim.

## Request and output boundaries

- Central payment class now limits declared body length to **8192 bytes**.
  Handlers must also bound actual streamed bytes. HTTP Content-Length alone
  is not a complete defense against a misleading/chunked request.
- Nitro middleware currently applies `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin`.
  These are defense-in-depth, not guarantees that compromise is impossible.
- The sold capability response is sanitized *before quote freezing* via
  `sanitizeAndRehashPaidPreparedResponse(..., {rejectEmbeddedLinks:true})`.
  `assertPublicPaidOutputBoundary` rejects raw material fields, nested
  upstream identity keys and embedded source URLs; the immutable paid body is
  rechecked against the ledger digest. Qualified official-authority and
  contractually required attribution may remain disclosed by explicit policy.
- The tier's `provenance_mode` documents the policy but does **not** itself
  sanitize runtime responses. Separate direct endpoint tests and external
  payload sampling are still required.
- Both dedicated peppers must be at least 32 characters. **Length alone does
  not imply entropy**: use two distinct cryptographically random secrets, rotate
  with a migration plan and validate in the deployed environment.

## Production acceptance checklist

1. Merge exact-head CI after the central-security and x402 tests pass.
2. Deploy that exact commit to every real-money ingress. Confirm its version.
3. Verify security headers and that GET/OPTIONS/free research remain available.
4. Set `GEOMACRO_COMMERCE_EMERGENCY_FREEZE=true`, wait for platform propagation,
   then externally verify HTTP 423 for PayPal order create/capture, crypto verify,
   Coinbase/Circle/Nevermined POST, canonical paid intelligence and Risk Gate POST.
   Use **no real funds** to perform this test.
5. Test selective `paypal,coinbase_x402` isolation, with independent other
   provider behavior and no ledger mutation.
6. Restore the desired launch state only after confirming appropriate
   credentials, two peppers, database security, immutable paid receipt and
   current product deliverability.
7. For a funded acceptance, record one genuine capped buyer transaction,
   a settlement receipt, an immutable response hash, no duplicate charge and
   its exact released deployment SHA. Without these, record revenue as
   **unverified** and do not claim all rails are live.
