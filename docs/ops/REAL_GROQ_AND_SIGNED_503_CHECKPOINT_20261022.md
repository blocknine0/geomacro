# Exact production recovery checkpoint — 2026-10-22

## Live Groq browser actual response

The owner confirmed the SAME existing `GROQ_API_KEY` is on their Groq
Free Plan and is already installed in Lovable and GitHub production. Groq
documentation says `openai/gpt-oss-20b` supports its built-in
`tools:[{type:"browser_search"}]`, `tool_choice:"required"`;
see https://console.groq.com/docs/tool-use/built-in-tools/browser-search.
It is NOT xAI Grok and no new Groq account, key or Lovable AI credits are
required. Free usage is capped at organization limits; do not upgrade.
Groq browser search and strict structured JSON response_format do not work
together; Geomacro must validate model JSON TEXT separately.

`.github/workflows/groq-live-browser-acceptance.yml` makes ONE real
production-scoped request with the previously installed GitHub Groq key
to the exact canonical fallback client, then logs only fixed codes:
HTTP status, whether a completion was received, whether the text appeared
to be JSON, number of strictly accepted provisional research leads. The
output contains no source article, model prose, URL, user query or API key.
No routine cron (single merge push + explicit manual dispatch), no x402,
B2, D1 writes or Supabase. A HTTP 200 with non-JSON model text is **NOT**
a structured-delivery acceptance success. A validated provisional lead is
NOT a verified original, commercial licence, independent reviewer score
or paid signed GRO.

## Deep-health 503 and 0/3 signed hot: genuine root causes

Recent canonical [Public D1 Hot Serving Root Cause run #39741729831](https://github.com/blocknine0/geomacro/actions/runs/39741729831)
found D1 schema 5/health 200, historical GRI D1 anchor valid, but actual
current immutable B2 lineage/readback NOT AVAILABLE. All 3 hot products
`HOT_SNAPSHOT_STALE_OR_INVALID` and public deep health 503. As of the
run: Intelligence source age **18,054 minutes**, Global Risk
**19,289 minutes**, Risk Indices **20,266 minutes**; all expired.
These are actual source clocks: extending a TTL cannot create real new
inputs or truthfully turn them current.

The publisher still requires:
1. A real latest three-domain, source-date-qualified, Facts+Rights signed
   machine Intelligence immutable B2 input and exact SHA.
2. Actual original historical B2 GRI baseline readback, separate genuine
   current numerical GRI evidence/review and real signed country/category
   certificates. Owner states there is no human independent reviewer: a
   separate documented AI-internal research proof must **NOT** be
   presented as an external independent reviewer or inserted in the
   canonical independent-review certificate field.
3. GRI current production signing/revision + fresh current Risk Indices
   computation based on genuine accepted GRI parent.
4. B2 SHA readback, matching D1 promotions, public product 3-of-3
   HTTP 200, canonical website SHA and real `/api/health?deep=1` 200.
No source rights are invented from raw-free derived facts, and no
unverified event or numeric GRI is artificially restamped.

Free Geomacro-owned news/Finds remain separately available and should
continue to serve `free structured data` while signed commercial
products honestly return unavailable. The local laptop is NOT needed
24/7: existing hosted GitHub ingestion and existing 15m signed-ready
backstop handle current actually signed input pointers when available.

## Production deploy parity caveat

Owner previously published `d156e782...` (#2650 includes Groq fallback),
but new main `a059504...` and subsequent changes advanced afterward.
GitHub-to-Lovable source mirror success does not prove public deployed SHA
is identical; smoke checks public `/api/deployment-build` separately.
Do not mistake a successful free news/D1 canary for signed B2 acceptance.

## What this PR can and cannot accomplish

**Can:** directly prove whether Groq's authenticated browser tool returns
an actual response/accepted strict JSON lead using existing Free key and
GitHub hosted runner; categorize errors without exposing upstream texts
or payments.

**Cannot:** create non-existent current official article bytes, legal
licences, dual Facts/Rights signatures, independent certified GRI scores,
recover unreadable B2 bytes, magically update timestamp, deploy Lovable
without release action, or claim actual paid 3-of-3 without readback.
