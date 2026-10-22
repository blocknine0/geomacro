# Use the EXISTING Geomacro Groq API key

Owner instruction: **reuse the Groq key already configured**; do not
provision or rotate a key, create a second Groq account, use xAI Grok,
require 24/7 laptop, enable subscription, or use an unverified paid tier.

## What is implemented

- Existing `GROQ_API_KEY` is already used by `auto-ingest-news.yml`,
  `ai-assisted-private-research-review.yml`, the `groq.server.ts` Ask
  formatter and optional `groq-browser-live-fallback.mjs`. These
  share the **same secret name**, not separate new credentials.
- `existing-groq-key-free-readiness.yml` runs in hosted GitHub
  `environment: production`, once after merge, daily and manually.
  It reads the existing protected secret and makes ONLY one authorized
  **GET https://api.groq.com/openai/v1/models**. There are ZERO model
  completions, browser searches, payments, B2/D1 writes, licence grants or
  secret values in the output. It reports existence and whether the
  `openai/gpt-oss-20b` model is listed, not the account's billing tier.
- Existing official sources and GDELT still come before the optional Groq
  browser-search fallback; verified numbers, native article dates, paid
  GRI and publication rights continue to fail closed on missing evidence.

## Critical deployment distinction

GitHub `production` secrets are **not necessarily** Lovable/hosting
application runtime secrets. A green GitHub metadata check does not
prove `geomacro.live/api/public-ask` has access to the same key or
server-side variables. Check the existing Lovable project's Secrets or
the actual SSR deployment runtime without exposing any credential.
**Do not copy the secret into public Vite/React `VITE_*` variables**.

In the actual server runtime that serves Ask Geomacro, the optional
browser-search module needs these **two non-secret** variables in addition
to its already-existing `GROQ_API_KEY`:

```ini
GROQ_BROWSER_SEARCH_ENABLED=1
GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK=YES_BROWSER_FREE_TIER_CONFIRMED
```

The owner must first confirm their actual Groq organization is on its
**Free** plan and browser-search use is allowed within its no-charge
allowance. Groq's public docs state Free usage has zero charge and a
429 on exhaustion, but **the key alone does not reveal whether an
organization is currently Free or Developer**. We therefore deliberately
DO NOT pre-set `YES_BROWSER_FREE_TIER_CONFIRMED`, perform a billable
browser_search call, or claim live activated without inspecting the real
Groq project plan. Go to the existing organization's
https://console.groq.com/settings/billing or https://console.groq.com
Billing/Usage view to confirm the plan; never add a card.

**Budget note**: current browser fallback enforces one provider call per
eligible request but has no distributed quota cap. Before exposing it to
unlimited traffic, enforce an atomic shared request budget (e.g.
Cloudflare D1 governor); existing Groq limits are a provider-side safety
cap only for actual Free plans. Rate-limit/429 is a degraded response,
not proof of no global current events.

## Trust and rights

Groq browser-search leads are provisional, not original publisher
HTML readbacks, verified country facts, legal source reuse grants,
independently reviewed GRI or chargeable GRO. Customer-facing facts-only
Geomacro-authored structured news continues without the unrelated
human-review certificate; third-party copying, access terms, protected
expression, attribution and database contracts may still apply.

## Proof and follow-up
Run the hosted workflow from Actions once:
[Existing Groq Key Free-Browser Readiness](../../.github/workflows/existing-groq-key-free-readiness.yml)

Its only safe output consists of fixed state codes:
`EXISTING_KEY_CAN_READ_GPT_OSS_MODEL_METADATA` means the installed
protected GitHub key is accepted by a read-only Groq endpoint.
`BROWSER_SEARCH_ACCOUNT_ELIGIBILITY` is intentionally not claimed.
No live searches or free-plan entitlement can be inferred from this
readback alone.

The old signed 3/3 hot Intelligence/GRI/Risk Indices pipeline and
`/api/health?deep=1` remain separately production gated until actual
current signed B2/D1 publication/readback and healthy site deployment.
