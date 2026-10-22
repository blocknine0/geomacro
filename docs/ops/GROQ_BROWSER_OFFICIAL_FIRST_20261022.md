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

## 2026-10-22 Free Plan + existing Lovable secret owner confirmation

Owner explicitly confirmed the **same existing** Lovable Secrets
`GROQ_API_KEY` is configured, the Groq organization is on the **Free Plan**,
Lovable and GitHub repositories are already connected, and Lovable AI prompt
credits are currently unavailable. Do not provision a second Groq key, new
account, card or paid service. Implement by GitHub PR + existing sync, NOT
a Lovable conversational edit prompt.

For this narrow official-source/GDELT-miss **Ask research** path,
`OWNER_CONFIRMED_EXISTING_GROQ_FREE_20261022=true` is a source-controlled,
auditable feature approval. Browser fallback works with just the existing
server-side secret, even when the two optional Lovable variables were never
entered; no Lovable AI credits/secret edits are required for the code path.
Live production success is still subject to actual website publish/parity
and the server runtime seeing `GROQ_API_KEY`.

The two optional runtime values may override and shut OFF the feature:
```ini
GROQ_BROWSER_SEARCH_ENABLED=0
GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK=DENY
```

Safety: one browser-search call only after official/news-index miss; at most
**six browser calls per hour and twelve per UTC day per Node runtime**,
bounded model/time budget, 429 fail closed, no retry. Per-runtime budgets
are **not an atomic distributed per-org quota**, so the Groq Free Plan's
organization limits remain the final safety backstop. If traffic or
concurrency materially rises, do not promise unlimited free usage:
implement shared D1/quota arbitration before increasing volumes. An
operator changing the Groq organization to a paid tier must set the
explicit opt-out or change this audited source approval before production
traffic resumes.

Groq's official free plan GPT-OSS 20B baseline (as of Oct 2026) reports
30 RPM/1000 RPD/8K TPM/200K TPD, subject to the user's org's exact limits:
https://console.groq.com/docs/rate-limits . Free Plan overages generally
return 429. Browser-search tool usage and provider access are nonetheless
subject to the actual Groq account and Groq's published terms.

**GitHub-to-Lovable:** a successful GitHub/Lovable source mirror is
NOT proof that `geomacro.live` was automatically published. Check deployed
SHA, `/api/public-ask` contract, browser answer and current website lock
without inventing health 200. Even with exhausted Lovable AI prompt credits,
GitHub code can be committed; actual Lovable publish depends on the
hosting project's existing publish workflow/controls.

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
