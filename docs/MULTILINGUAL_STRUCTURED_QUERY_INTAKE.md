# GeoMacro multilingual structured query intake

Status: additive, no-funds interpretation. This change does not deploy, authorize mainnet payments, or touch PREDGE.

## Public API

GET /api/v1/intelligence/interpret: discovery.
POST /api/v1/intelligence/interpret: one JSON question. Example:

    {"question":"ভারতের মুদ্রাস্ফীতি ও বৈদেশিক মুদ্রার রিজার্ভ","language":"bn"}

A second example:

    {"question":"ভারত থেকে বাংলাদেশে লিথিয়াম ও মুদ্রাস্ফীতির করিডোর প্রোফাইল"}

Optional inputs: language, subjects, topics, product, ranking, change, risk_gate_context, as_of, max_age_seconds, client_request_id.

Response fields include canonical_request, query_plan_hash, normalized subjects/topics/intent, required_modules, selected_product, indicative_catalog_price, and no-funds flags. The returned canonical_request goes unchanged to POST /api/v1/intelligence/products-availability for actual original-dated evidence checks and, only when eligible and authorized, POST /api/v1/intelligence/query for the existing signed, payment-bound response. No interpretation result guarantees data availability or payment acceptance.

The interpreter never accesses D1, B2, external models, Google, real-time search, signing keys, payment, or settlements. HTTP 400 ambiguity/unsupported responses are no-charge. It applies a maximum 8192-byte JSON size and rate limit.

## Language and routing scope

The 195 ISO3 countries are recognized through the existing canonical registry plus Intl.DisplayNames over nineteen common locales: en, bn, hi, ur, ar, fa, es, fr, de, pt, ru, zh, ja, ko, id, tr, sw, it, ta, with a few curated inflections. Topics/intents use bounded multilingual terms, not unrestricted translation or a promise of comprehension of every language or dialect.

For every other language, clients can supply explicit ISO3 subjects and canonical topic enums with the original Unicode question. Unsupported language text cannot generate a presumed translation or authorize payment. Country-pair direction must be explicit; ambiguous countries, dimensions, historical semantics, change/ranking or policy requests fail closed. A language parameter describes the original query and cannot override evidence gates.

## Minimum evidence per variant (USDC)

| Variant | Requirements before any payable delivery |
| --- | --- |
| Country digest 0.02 | One country and one qualified structural dimension, at most 3 observations per module |
| Country profile 0.03 | One country and at least two qualified dimensions, at most 12 observations/module |
| Corridor digest 0.05 | Ordered origin/destination; one dimension evidenced at both endpoints |
| Corridor profile 0.08 | Ordered origin/destination; at least two dimensions qualified at both endpoints |
| Intelligence focused 0.05 | One subject/topic, compact qualified answer, genuine state and timestamp |
| Intelligence standard 0.10 | One subject, up to three semantic topics, supporting qualified analysis |
| Intelligence complex 0.15 | Multi-source qualified state and cross-domain synthesis; no invented causation |
| Existing signed object 0.05 | Independently verified nonexpired publication, original signed bytes and proof |
| New signed object 0.10 | Verified publication later than explicitly supplied cutoff; cryptographic readback |
| Risk Gate preflight 0.10 | Existing valid signed proof + user action context + advisory policy evaluation |
| Risk Gate standard 0.15 | Qualified policy evaluation including the valid signed object |
| Risk Gate complex 0.25 | Deeper qualified multi-source evaluation including the valid signed object |

Shared data requirements: country ISO3 and directional entity references, dimension ID, observation and publication time, effective period, units, independently qualified evidence, internal rights/certification and provenance, freshness window, source-native clock, null-vs-zero integrity, deduplication, cross-module coverage, canonical methodology and schema versions, immutable output hash and settlement ledger proof. Risk Gate additionally requires policy version, action type, explicit risk criteria and non-executing disposition. The existing internal evidence restrictions remain; no raw source feeds/publisher URLs/licensing metadata become customer-facing payloads.

This is a requirements matrix, not an assertion of currently populated D1/B2 data or commercially qualified coverage. Actual data gaps require production per-country/per-module census and source-native-clock verification.

## Acceptance and rollout

1. Test Bengali, Hindi, Arabic, Spanish, French, German, Russian, Chinese, Japanese, Korean and Portuguese samples; test unsupported-language fallback, ambiguous query, corridor ordering and no-payment guarantees.
2. Confirm app routing and GET/POST/OPTIONS after the project builds.
3. Validate that no PREDGE files, workflows, secrets, contracts or service behavior change.
4. Re-run existing qualified-data preflight for each real buyer plan; never derive commercial readiness from the interpreter.
5. Confirm canonical query hash, exact prices, genuine independent signature verification, payment and replay checks before any actual x402 settlement.

PREDGE stays locked and untouched.
