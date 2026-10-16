# Remaining source-stage migration

This migration connects the former Supabase-dependent source stage to existing canonical readers and D1 state. Supabase stays frozen; there is no SDK-compatible replacement database, raw-article warehouse, paid provider activation or new intelligence engine.

| Former dependency | Current execution path |
| --- | --- |
| Country registry / phase-A heartbeat | Existing canonical 195-country registry and D1 scheduler cursors |
| GDELT V2 Event export | Exact checksum/size-verified static ZIP; official FIPS lookup mapped to canonical ISO3; bounded country aggregates in D1 |
| GAL raw Storage/DB discovery stage | Existing GKG static discovery and bounded private first-party page-date verification; no raw GAL fragments persisted |
| RSS ingestion / free publication | Existing three-category derived journal and automated issuer-signed Finds publisher |
| Open live source mesh | Existing category open-data readers, with derived-only D1 context checkpoints |
| Country raw mesh and realtime fanout | Existing 195-country canonical on-demand engine; no bulk raw record fanout |
| Supabase country-readiness workflow | Explicit routing plus actual public D1/Finds audit; never a paid Risk Gate census |

The new restricted-safe source-runtime task executes inside the existing D1 orchestrator. Both static GDELT readers share one bounded lastupdate manifest. Event and GKG ZIPs reuse the established hard-cap decompressor and exact filename/origin policy. Only a checksum-verified Event batch up to 60 minutes old can produce index-country counts. GKG retains its existing two-hour index bound. Index batch/date-added clocks never become original news timestamps. FIPS codes are never assumed to be ISO2: for example FIPS CH maps through the official lookup to China, not Switzerland. Unmapped codes remain explicitly unmapped.

The same task reads the existing public open-data adapters and stores only their derived outputs, original observation clock and reference periods in three existing pipeline_checkpoint rows. If a new read fails, a prior valid context remains usable up to three hours without renewing its timestamp. One summary row carries counts-only Event/GKG/source status; every write is followed by exact D1 readback. No new D1 table or B2 request is needed.

The existing category open-data/combined APIs gain a real fallback when all live upstreams fail: they read the corresponding D1 context and preserve the producer's checked_at and dataset/event clock semantics. Malformed, stale, future, cross-category, raw-source-leaking or paid-context payloads are rejected. The writer disables this fallback so a previous D1 row can never masquerade as a newly fetched source response.

The control-plane Worker exposes public, bounded projections at `/v1/public/source-runtime` and `/v1/public/source-runtime-context?category=geopolitics`, `macro-fx`, or `critical-minerals`. The protected workflow independently exercises actual D1 fallback through all three existing category readers, without contacting upstreams during that verification.

DOC search has an additional shared in-process request gate: one active request, 5.5-second start spacing, bounded cancellation, and preserved 401/403/429 cooldown/Retry-After. Concurrent callers fail over to their existing independent original publishers rather than queueing unbounded requests. This reduces self-generated bursts; it does not guarantee a global GDELT quota across independent machines or make a denied service healthy. The existing static GKG route remains the normal scheduled discovery reader.

The source inventory remains conservative: static references in manual/frozen recovery scripts are not automatically reachable execution or runtime proof. Reviewed scoring, GRI/Risk Indices publication, source rights and x402 gates remain separate. This migration does not declare those products recovered, treat all 585 country/category cells as live evidence, or enable paid-source calls. Existing manual legacy scripts remain available for explicit historical recovery; scheduled source execution no longer depends on their SQL tables.
