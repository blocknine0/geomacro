# GeoMacro — owner-approved PayPal + Cloudflare READ-ONLY checks

This separate PR is SAFE to merge without a commercial deployment:
it adds NO Worker, payment handler, SQL migration, billable capture,
customer entitlement, public route or traffic shift. It contains
isolated negative tests and an owner-dispatched GitHub Actions workflow.

## One-time owner setup (never paste tokens into chat or PR comments)

1. PayPal Developer → **Live** app: confirm/create REST client ID
   and client secret. Confirm a LIVE webhook at exactly
   `https://geomacro.live/api/v1/payments/paypal` subscribed to
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, and
   `PAYMENT.CAPTURE.REVERSED`. Separately confirm PayPal merchant
   India cross-border/international USD receiving is approved.
2. GitHub `blocknine0/geomacro → Settings → Secrets and variables → Actions`:
   add `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
   `PAYPAL_WEBHOOK_ID` as **secrets** (or existing
   `GEOMACRO_PAYPAL_*` equivalents; pairs MUST match if both exist).
   Add a dedicated **D1 read-only** `CLOUDFLARE_API_TOKEN` as a secret.
   Set `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` (production UUID),
   and `GEOMACRO_D1_SHADOW_DATABASE_ID` (shadow UUID) as repository
   variables (or Actions secrets). UUIDs must refer to distinct DBs.
3. After this NO-FUNDS PR passes reviews and is merged to `main`,
   open GitHub **Actions → Hot50 Commercial Provider Read-only Preflight**
   → **Run workflow**: first select `shadow / base`. The PayPal
   and D1 jobs independently generate **sanitized JSON artifacts**.
   `base` requires the protected Step3 0213 pointer table; if that
   migration is not yet applied, a real `NOT_YET_VERIFIED` failure
   is correct, not an excuse to delete the gate.
4. After protected encrypted D1 migrations and shadow commercial 0215/0216
   have been applied independently, rerun `shadow / full`; then
   `production / full` after verified provider-approved production
   migration. Never run a production migration from this workflow.

## What a PASS means

- PayPal `PASS_WEBHOOK_CONFIG_ONLY`: live OAuth valid; registered
  webhook ID, HTTPS URL and capture/refund/reversal event set match.
  It does **NOT** prove merchant KYC, live international receiving,
  captured funds or entitlement credit.
- D1 `PASS`: the specified remote D1 physically contains the
  required canonical schema and Step3 Phase2H pointer table/indexes;
  `full` additionally proves 0215/0216 signed Hot50 tables,
  uniquely keyed PayPal handoffs and immutable receipt triggers.
  It does **NOT** prove AES-256 recovery checkpoint, provider-funded
  customer state, Ed25519 score correctness or real B2 byte parity.

Both checks are read-only. No real-money pilot until source-rights,
150 signed current Hot50 cells, physical B2 GET/readback, exact-head
protected canary and refund/usage ledger gates are independently PASS.
