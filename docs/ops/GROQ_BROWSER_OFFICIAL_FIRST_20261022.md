# Groq (NOT xAI Grok) official-first browser-search fallback — 2026-10-22

Owner preference: 195 countries, geopolitics, macro/FX, critical minerals;
free first-party official publishers first; use existing `GROQ_API_KEY`
when free official/news indexes have **no eligible matching current leads**.
Return Geomacro-original structured language and no raw upstream articles.

## Verified 2026-10-22 Groq functionality

Groq supports browser_search via server-side tooling in
`POST https://api.groq.com/openai/v1/chat/completions`,
`tools:[{type:"browser_search"}]`, `tool_choice:"required"` and
`openai/gpt-oss-20b` (or 120b). The earlier `groq/compound` and
`groq/compound-mini` IDs were retired 2026-09-21.
Browser search and strict `response_format` structured JSON mode
are **incompatible in the same tool call**. An untrusted browser-model
JSON **text** candidate is accepted ONLY when it matches a strict
fixed-schema validator; otherwise zero leads, no hallucination.
See https://console.groq.com/docs/tool-use/built-in-tools/browser-search

## Existing integration

- `src/lib/ask-answer.server.ts` still tries official numerical APIs,
  canonical first-party original pages and the authenticated 72-hour derived
  D1 newsroom first. For broad current questions, existing public GDELT
  fixed-topic indexes are also checked first.
- `src/lib/ask-realtime-search.server.ts` calls the new Groq browser
  fallback **only if no matching free index hits**.
- `scripts/lib/groq-browser-live-fallback.mjs` takes ONLY the canonical
  ISO3 + country name and *fixed* category strings, NOT any freeform
  customer's question. It makes at most **one** Groq tool call for a
  given Ask fallback, constrained to at most 3 research leads.
- Source article raw text/titles/URLs are not returned; model-generated
  summaries are separately validated to be bounded prose with no raw URL,
  original timestamp claimed as verified, quote, unverified numeric GRI,
  legally licensed rights, independent review, signature or payment.
  Country and topic must come from the Geomacro canonical local resolver.
  Unverified research is labelled low-confidence, not invoice eligible.
- Public free derived D1 news, website finds and signed paid GRO/GRI
  remain separate. This change does not touch paid/x402 code, entitlement
  catalog prices, frozen Supabase, B2, immutable hot snapshots or Risk Indices.

## Production configuration: consent and zero-cost discipline

Existing server-side `GROQ_API_KEY` is reused. The module is **OFF**
until the owner confirms *actual* project free-tier browser-search usage
and explicitly sets these **SERVER-SIDE** environment values (not public
frontend vars or source code):

```
GROQ_BROWSER_SEARCH_ENABLED=1
GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK=YES_BROWSER_FREE_TIER_CONFIRMED
```

The opt-in is deliberately separate from any basic Groq classifier key or
two-model AI-review allowance. Having a Groq key does **not** prove browser
search is free, enabled or within remaining daily quota. Check project
limits, remaining capacity and any provider-specific browser-search billing
before enabling. Never add a card or paid subscription without owner
permission. If no free browser entitlement, keep both variables unset and
continue free first-party/GDELT facts-only output.

This per-request max-one-call limit is **not a distributed daily quota**.
Before enabling high traffic, add exact shared server-side request budget/
limiter (e.g. Cloudflare D1 immutable hourly counter with atomic reserve)
or retain strict request-level upper bounds. Do not present this option as
unlimited 195-country search or 24/7 guaranteed free requests.

## Evidence/security limitations

Groq browser-search snippets are SEARCH PROVIDER output, NOT authenticated
first-party article bytes. Claimed source domains and publisher dates are
private *leads*; the canonical original page must be reread under issuer pin,
native timestamp/attribution/source rights determined as applicable and
event assertions corroborated before independently signed, chargeable GRO.
Do not blanket-assert every third-party licence from the fact that derived
output contains no article copy: underlying source access terms and
protected expression/database content still matter.

Until genuine current B2/D1 3/3 score and origin readback passes,
production deep-health HTTP 503 remains correct; this tool should not
simulate paid GRI, a rights grant, or a signed customer delivery.

## How to validate
```bash
node --test scripts/lib/groq-browser-live-fallback.test.mjs
```
This test makes NO external API calls, generates NO real funds, and
covers malformed model response, original-source status, strict category
scope, never-leak-user-question constraint and missing-cost-ACK zero calls.
