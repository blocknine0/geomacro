# Current signed 3/3 + x402 checkout — strict recovery

**Owner scope:** Geomacro direct commercial APIs only. Predge partner testing,
its existing shared news D1 data, partner credentials, email, delivery endpoints
and signed-market integration must NOT be changed by this recovery.

## Latest real production evidence (23 Oct 2026)

- GitHub `main` at diagnosis: `2b060f9d0e9f0d0123f6ae1d5a23228307e8f58c`.
- [Live commercial no-funds acceptance](https://github.com/blocknine0/geomacro/actions/runs/39926640004):
  actual deployment marker not canonical, deep health HTTP 503,
  current signed Intelligence/Global Risk/Risk Indices 0/3, no-payment
  availability HTTP 422. The x402 discovery is correctly still prelaunch.
- [Public D1 metadata diagnosis](https://github.com/blocknine0/geomacro/actions/runs/39926640014):
  all three records reject with SOURCE_TOO_OLD and EXPIRED.
  No B2 GET or D1 mutation made; old source clocks cannot be extended to pass.
- [Hosted authority config](https://github.com/blocknine0/geomacro/actions/runs/39925340794):
  B2/Cloudflare secret names present, but one or more Facts/Rights/GRO
  public key PEM/SPKI-pin identities are missing, mismatched or duplicate.
- [Pallab/Suman public-key readiness](https://github.com/blocknine0/geomacro/actions/runs/39926292008):
  previously reported good while testing only SHA shapes for Facts/Rights, not
  both actual public PEMs; this difference is fixed now. Strict GRI cannot
  publish until all real public keys are validated and separate.
- [GRI automated policy consent](https://github.com/blocknine0/geomacro/actions/runs/39927259315):
  two consent signatures verified, BUT publisher integration is pending,
  real qualified original evidence, country certificates, machine private
  key execution, independent immutable historical B2 readback and current
  scored-GRI publication are not verified. Consent is not a batch review
  or a commercial source-rights grant.

## One-time protected public key repair (no private keys in cloud)

Open `https://github.com/blocknine0/geomacro/settings/environments` then
`production` → **Environment secrets**. Verify BOTH PEM and SHA256
names for Facts and Rights, not SHA alone:

- `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM`
- `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256`
- `GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM`
- `GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256`
- `RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64`

Reuse only already authorized public identities with a genuine independent
Rights custodian. For each public PEM, lowercase SHA256 MUST hash the
DER/SPKI bytes, not the textual PEM. The updated production workflow prints
only fixed diagnostics (e.g. `PUBLIC_PEM_SECRET_MISSING`,
`PUBLIC_PEM_SHA256_PIN_MISMATCH`) and never prints key content.
Do NOT generate fake replacement reviewer/Facts/Rights signatures, copy
Pallab or Suman private keys into GitHub or change Predge secrets.

After protected public secrets are correctly configured, rerun
[Pallab and Suman Independent GRI Authority Readiness](../../.github/workflows/pallab-suman-independent-gri-authorities.yml)
and [Hosted Authority Readiness](../../.github/workflows/hosted-authority-readiness.yml).
Both must be green, but this establishes only public configuration.

## Authenticated publication, no artificial currentness

1. Obtain current original source evidence and verify product-specific
   commercial rights, native publication timestamps, separate Facts/Right
   signatures for a concrete Intelligence batch.
2. Publish only through the *existing* authenticated
   `intelligence-machine-current.yml` pipeline using exact immutable B2
   SHA handoff, quota-admitted write/readback and D1 hot promotion.
3. Independently obtain genuine numerical GRI policy-scored input and
   validated country/category certificates from existing approved
   authority (or an explicitly scoped, fully implemented automated
   policy publisher once independently accepted). A standing consent
   envelope alone does not create such evidence. Verify original
   source-clock recency and historical B2 immutability.
4. Only after the independently current signed GRI parent is verified can
   `Risk Indices from Verified D1 Global Risk (No Funds)` rebuild from
   this actual parent. Reuse of stale historical score as *historical* data
   is permitted with truthful dates, never as current.
5. Verify three separate current signed hot public endpoints HTTP 200,
   `/api/health?deep=1` HTTP 200 and the exact deployed
   `/.well-known/geomacro-build.json` SHA equal to current GitHub main.
   A successful GitHub-to-Lovable source mirror is NOT production Publish.

## Production buyer checkout — no paid action until positive acceptance

Use [Live Commercial Go-No-Go No Funds](../../.github/workflows/commercial-live-production-no-funds.yml)
and [First Earnings Zero-Funds Live Acceptance](../../.github/workflows/earn-first-live-no-funds-acceptance.yml)
AFTER the actual live website and signed data are ready. The canonical
buyer path is `POST /api/v1/intelligence/query`, with no-charge
`/api/x402/risk/availability` and capability-bound quote, freeze/replay
protection and Durable Object ledger. Existing exact locked USDC prices
must NOT be altered. The current price catalog alone is not an available
commercial product or proof of source licensing.

Until a real eligible product delivers a verified **no-funds quote**,
x402 payment must remain disabled. Even after a positive no-funds preflight,
a separate explicit owner real-USDC authorization and a genuine external
payment settlement/reconciliation are needed to claim revenue. Do not
activate mainnet credentials or payment ACK automatically.

**Permanent design:** every later source update requires fresh native
evidence, real rights and valid signatures; 15-minute guarded backstops
can dispatch already-approved immutable signed input, but can never
generate human authorization, commercial licences or independent
signer keys on their own.
