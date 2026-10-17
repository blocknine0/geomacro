# Issue #2044 — Bound real original-page HTML evidence before machine risk scoring

The new private module `scripts/lib/geomacro-machine-original-binding.mjs`
reuses existing pinned source publisher/organization and exact-event candidate
clustering plus independent bounded original HTML page readback.

One machine candidate must represent one precisely identified structured event
corroborated by two to four distinct original first-party issuers.
Checks reject a single issuer, duplicate originals, syndicated copies,
stale clocks, material disputes and retractions before any page GET.

Readback obtains the actual original HTML bytes and first-published clock
from each allowed publisher path, no redirect or unbounded response; the
recomputed HTML SHA-256 must equal the candidate's claimed content SHA.
Any legacy article URL identity hash fails this check rather than being
mistaken for actual HTML content. Each reread clock must align with the
original publisher-native timestamp, per-source and event claim/category.

Success status: TWO_ORIGINAL_BYTES_BOUND_SEMANTIC_AND_RIGHTS_PENDING.
Output contains SHA-only evidence-set commitment, identical event claim SHA
and counts; no source URL, provider title, original HTML or raw payload.

**Important:** A source byte/hash match does not demonstrate that articles
actually support the *meaning* of the same-event claim or confer commercial
derived-use licence. The proof returns
`semantic_same_event_claim_verified:false`,
`source_derived_commercial_rights_verified:false`,
`signed_commercial_gro:false`, `payment_authorized:false`.

## To finish actual Geomacro automated commercial proof

1. Receive two or more current same-claim, distinct first-party original
   article inputs from trusted private source intake and run bounded readback.
2. Independently validate semantic who/what/where/when evidence, conflicts
   and retractions against **those exact reread article bytes**.
3. Verify per-article derived commercial use and attribution compatibility,
   and independently reread the authenticated current B2 rights ledger.
4. Bind all those proof hashes and rights metadata into a separately named
   Geomacro internal-automated GRO, sign via the existing issuer key and
   verify exact canonical GRO signature independently.
5. Run production D1/B2 hot-readback and x402 no-funds checks before any
   explicit founder ACK or real-money charging.

No public website, existing reviewer-attested Federico path, strict
commercial policy, B2/D1 write, Supabase read/write or x402 settlement
was modified in this change.
