# Hot50 continuous multi-source Risk Gate — isolated safe rollout

## Scope and claims

* 50 owner-selected countries × GEOPOLITICS, MACRO_FX, CRITICAL_MINERALS = **150 cells**. The existing one-minute Control Plane cron rotates **2 cells per minute**, visiting all 150 cells in 75 minutes when the Worker remains scheduled. Each inspected cell receives an atomic D1 upsert/readback.
* The already installed 20-minute derived-discovery workflow retains **canonical, private_osint, reusable_news, gdelt_cameo, website_intelligence** leads. This consumer also incorporates signed-original stream evidence and metadata-only Google News searches. **Never infer a country from a nullable country field**: such signals stay in unassigned discovery, not a fabricated country cell.
* A Basic research candidate is saved whenever a valid country/category lead exists, even if its rights are unverified. Basic **research** is not a commercial GRO, certified index, or paid entitlement.
* Standard may reference **only an already signed internal GRO** backed by two independently fact- and rights-attested original publisher events, a shared event fingerprint, required category-specific source roles, non-expired rights and distinct publisher owners. Two copies of one syndicated article or two Google Search hits DO NOT satisfy this condition.
* Commercial authorization is **separate**: the existing independent reviewer, a genuine signed release, real client entitlement, pinned Ed25519 keys and the 0217 issuer worklist are all mandatory. A valid source GRO cannot alone generate a payable delivery. GeoMacro's license concerns **GeoMacro's original derived scores**, not third-party text or API rights.
* For Complex, the separate cron append now consumes only previously licensed, independently reviewed true GROs and uses existing 0216 D1/R2 immutable signed history. The existing `verifyGeoMacroSevenDayHistory` requires seven *genuine* consecutive UTC days and exact R2/signature verification. Missing days remain HOLD. No synthetic backdating.

## Deployment sequence (do not skip gates)

1. Merge the reviewed PR after all mandatory checks pass. Do not enable a commercial release while staging is failing.
2. Apply **0218_hot50_autonomous_search_cell_snapshots.sql** to both `geomacro-risk-stream-shadow` and `geomacro-control-plane` using the same protected Stage2 D1 migration protocol as 0215/0216/0217; record real D1 schema readbacks and roll-forward receipts. Never apply production SQL with an unreviewed SHA or bypass the Stage2 headroom/hold.
3. Deploy the candidate Worker to zero traffic with the real source/publisher and signing bindings verified. Use **RISK_GATE_COUNTRY_SCOPE=HOT50**, **RISK_STREAM_ACTIVE=1**, **STREAM_INGESTION_ENABLED=true**, **RISK_STREAM_HOT50_AUTONOMOUS_ENABLED=1** **only after** that protected infrastructure and Queue acceptance; retain **GEOMACRO_COMMERCIAL_STREAM_RELEASE=0**, **RISK_STREAM_CANARY_HOLD_CLEARED=0** until the independently signed release proof. The Git default in `wrangler.example.jsonc` keeps both commercial and autonomous release disabled.
4. Prove Worker cron every minute, 150 distinct cells within 75 minutes, 10-event Cloudflare Queue batches, provider D1 ACK/readback, actual independent publisher identity/corroboration, safely paced Google News index queries with 429 cooldown, and no truncated backlog/source lane. SLOs and zero provider 503 are *measurements*, never unconditional guarantees.
5. Run a protected **no-funds** HTTPS ACK staging check on the merged `main`, not a PR branch. Staging uses isolated shadow D1, non-customer mock-ACK Worker and ephemeral synthetic keys. A PASS establishes transport/staging behavior, not actual original-source rights.
6. Run existing protected canary review, 0 → 1 → 5 → 25 → 50 → 100% only on valid identical commit receipts, independent risk proof and quota/readback with owner approval. The hard safety/canary holds MUST NOT be removed due to this PR alone.
7. Only after proper signed go-live authorization, provision protected `GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64`, `GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64`, `RISK_STREAM_GRO_VERIFY_SPKI_B64`, `GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64`, private R2, `GEOMACRO_LICENSED_WEBHOOK_DOMAINS`, `RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256`, the reviewer service binding and valid customer subscription rows. Then and **only then** set `GEOMACRO_COMMERCIAL_STREAM_RELEASE=1`, `RISK_STREAM_CANARY_HOLD_CLEARED=1` per a verified independent signed release certificate. `RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED=1` additionally requires private R2 quota/cryptographic readback acceptance.

## Exact GitHub commands

```bash
REPO=blocknine0/geomacro
gh pr checks <PR_NUMBER> -R "$REPO" --watch
gh pr merge <PR_NUMBER> -R "$REPO" --squash --delete-branch

# AFTER the merge, explicitly re-run remote isolated shadow:
gh workflow run risk-stream-commercial-staging.yml -R "$REPO" --ref main \
  -f approval=RUN_SHADOW_COMMERCIAL_E2E_NO_FUNDS
gh run list -R "$REPO" --workflow=risk-stream-commercial-staging.yml --limit 3
```

## Verification SQL (read-only, run on each *real* targeted D1 binding)

```sql
SELECT name FROM sqlite_schema WHERE type='table' AND name IN
 ('risk_stream_global_search_leads','risk_stream_hot50_cell_snapshots',
  'risk_stream_commercial_outbox','risk_stream_commercial_risk_chain');

SELECT COUNT(*) AS observed_cells FROM risk_stream_hot50_cell_snapshots;
SELECT country_iso3,category,refreshed_at,signal_count,original_domains,
       basic_status,standard_status,complex_status,last_search_status,
       commercial_release_authorized,original_publisher_text_included
  FROM risk_stream_hot50_cell_snapshots
 ORDER BY refreshed_at DESC LIMIT 20;

SELECT state,COUNT(*) AS jobs FROM risk_stream_commercial_outbox GROUP BY state;
SELECT day_utc,COUNT(*) AS entries FROM risk_stream_commercial_risk_chain
 GROUP BY day_utc ORDER BY day_utc DESC LIMIT 7;
```

Never count `SEARCH_INDEX_LEADS_FOUND` as an independent original, `BASIC_RESEARCH_AUTOPUBLISHED` as a paid published Tier, `SIGNED_INTERNAL_GRO_AVAILABLE` as a licensed customer delivery, or an R2 PUT without exact readback as a 7-day proof.
