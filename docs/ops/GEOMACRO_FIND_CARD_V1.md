# Geomacro Find Card v1 — public no-source-derived API

Canonical public schema: \`public/schemas/v1/find-card.json\`
(website URL \`https://geomacro.live/schemas/v1/find-card.json\` after deployment).
Version: \`geomacro.find.v1\`, JSON Schema draft 2020-12; no required external API
or new third-party dependency.

## Working route

\`GET /api/v1/finds\` reads the **existing** Cloudflare D1
\`/v1/public/website-derived-news\` journal. Optional exact \`?domain=\`
geopolitics, macro or rare_earth. Only 15-minute-delayed, bounded/validated
existing journal observations may become cards. Never return private original
source identity, article URL, upstream title, raw article, hidden licence
metadata, GRO or payment data. No Supabase, B2 object read/write or new source
fanout. No evidence means an honest \`cards:[]\`; upstream journal outages
return 503 rather than invented stale content.

Current original-feed-only observations convert to **ANNOUNCED / LIMITED**,
\`evidence_directness=INDIRECT\`, empty unsupported facts and subjects,
\`extraction_confidence=0\` and \`severity=null\`. The wording is a
controlled, deterministic Geomacro paraphrase of the publisher-released
category/topic only. It is **not** a claim of independently established
same-event facts, current signed GRO, commercial licence or trade advice.
Never mark CORROBORATED/OBSERVED/FULL without separate per-field proof.
All user-specified conditional schema constraints are checked before serving:
FULL macro needs indicator, mineral FULL needs mineral, geopolitical FULL
needs actor; LIMITED permits no more than 3 facts and 0.5 confidence; severity
is ALWAYS absent or null.

### Calendar-date-only originals

The supplied schema requires \`published_at\` to have JSON Schema
\`format:date-time\`, while explicitly allowing \`date_precision:"day"\`.
The adapter encodes a date-only publisher release as UTC **calendar-day
sentinel** \`YYYY-MM-DDT00:00:00.000Z\` with \`date_precision:"day"\`.
THIS IS NOT A REPORTED PUBLICATION CLOCK. Consumer UI MUST display just the
calendar day; it must not use the sentinel as if the issuer released at
midnight. The existing original **day-only** embargo uses the original date
and next-day 12:15 UTC; the sentinel neither accelerates the embargo nor
changes D1 source time. No time precision can be reconstructed from a day.

### Attribution policy

Founder's locked no-attribution-only Find Card is honored: if existing
\`sources_credited\` contains any required acknowledgement, that original
derived journal signal is **excluded** from the no-sources Find Card v1
projection. It stays in the existing legacy website journal where publisher
credit/licence remains visible; no rights are silently stripped or upgraded.

## Deployment & proof

1. Run \`bunx vitest run src/__tests__/find-card-v1.test.ts\`; Product CI
   remains the guard for the legacy journal and x402 routes.
2. Merge through protected main; Lovable publishes the new SHA for
   \`/schemas/v1/find-card.json\`, \`/intelligence\` and \`/api/v1/finds\`.
3. Verify public schema returns valid JSON, a real journal-supported Finds GET
   returns \`geomacro.find-card-feed.v1\`, no upstream attribution leakage, and
   empty results are truthful. On outage GET MUST 503.
4. Validate day-only original publication labels and pre-embargo rejection.
5. This DOES NOT fix separately stale signed Intelligence, GRI, Risk Indices,
   HTTP deep health or x402. A signed free-derived observation is not a paid GRO.

The headline retains the pre-approved **topic taxonomy** (such as monetary
policy or critical-minerals policy) to distinguish cards without copying an
upstream article headline. It never injects an unverified event actor/value.
