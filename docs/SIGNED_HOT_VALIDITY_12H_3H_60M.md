# Signed hot reference validity 12h / 3h, live current <= 60m

Founder-approved policy: **Intelligence signed-reference validity maximum 12 hours; Global Risk (GRI) 3 hours; Risk Indices 3 hours.** This changes the canonical source-relative expiry ceilings for *newly verified snapshots*, never the original publication/assessment timestamps. The hard **live/current and commercial-serving clock stays at <=60 minutes**. Long-lived reference validity is neither a current-event guarantee nor a license to charge for stale delivery.

## One product, two clocks

- `source_as_of`: exact unmodified, independently verified original source time. A refresh poll, code release, or B2/D1 write MUST NOT update this time.
- `expires_at`: qualified source-relative reference expiry (Intelligence <= source + 12h; GRI and Indices <= source + 3h), further constrained by independently issued qualification deadlines (for example machine-derived Intelligence `qualified_until`).
- `live_freshness_eligible`: independently true **only** if actual source is <=60m old. Metadata-only D1 acceptance does not prove signatures, rights, B2 bytes or x402 eligibility.
- `freshness_status`: control-plane readback labels `LIVE_SOURCE_WINDOW` or `VALID_SIGNED_REFERENCE_NOT_LIVE` without falsely updating the source date.
- `/api/health?deep=1` and the public Intelligence, GRI and Risk Indices *current edge* responses continue to reject sources older than 60 minutes, even if signatures/references have not yet expired. Existing paid availability remains fail-closed and depends on additional rights and B2 readback.
- `/api/health?deep=1&profile=live-structured` remains the separate stateless, unsigned no-GRO product. It does not acquire signed product claims.

## End-to-end boundaries updated

1. Cloudflare control-plane signed hot PUT and D1 readback source-relative validity windows: 12h, 3h, 3h. No signature, source rights or immutable proof bypass.
2. D1 metadata classifier preserves original source expiry and separate <=60m live flag. Pre-expiry watcher monitors 12h/3h and warns for lost live freshness earlier.
3. Public Intelligence/GRI/Indices edges recognize extended signed validity but still refuse to *serve it as current* after 60 minutes. A valid 75-minute signed proof belongs in historical/reference views, not a current paid endpoint.
4. Website deep health independently checks <=60m source time as well as unchanged hashes, B2 readback, verified status and signature reference expiry.
5. Risk Indices' D1 GRI-parent contract recognizes 3-hour immutable proof validity but **new publication** still requires source and each category's reading <=60m, preventing a valid-but-old parent from creating new current indices.
6. Previously approved GRI original/reviewer qualification windows remain strict; this patch does **not** extend eligible original evidence age or fabricate a reviewer.
7. Current machine Intelligence verification may impose a shorter signed `qualified_until` than 12h. This exception is intentionally retained.

## Production acceptance

- Protected-main Product CI, CodeQL, three edge products and signed TTL/regression cases all pass.
- Exact compiled control-plane/edge deployment and website code SHA are verified separately; a GitHub merge is **not** a production deploy.
- With genuine fresh signed inputs, publisher writes signed reference expiry using new upper bounds, readback identifies source time and signed reference validity, health and current products remain green only while original source <=60m; at 75m the reference can be *valid* but current product/paid eligibility must fail.
- Snapshots from Oct 8, 2026 remain expired after these changes. Restoring current signed Intelligence, GRI and Indices still requires genuinely new qualified input, actual B2/D1 publication and complete readback. Do not mark production HTTP 503 closed without real evidence.
- Zero new Supabase use, no paid activation, no new B2 objects due solely to this policy change.
