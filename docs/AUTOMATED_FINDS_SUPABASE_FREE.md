# Automated issuer-signed Finds without Supabase

The founder-approved automated Finds path reuses the existing official-release reader, derived-only model, signing keys, B2 client, D1 quota governor, D1 control plane and 30-minute continuity workflow. It does not create another retrieval engine, reactivate Supabase, spend funds, score events or assert independent review. A signature authenticates Geomacro's output; it is not a reviewer verdict or commercial rights grant.

## Data flow

1. The existing collector reads all three categories. Native original publication dates, exact/day precision, deduplication, attribution and the existing 15-minute release gate remain authoritative. Raw titles, article bodies and original URLs remain ephemeral.
2. The existing free D1 derived-news journal is updated as before. Its independent browser/HTML fallback remains available even if signing or B2 fails.
3. The same collected reports produce three issuer-signed batches. No second source fetch is required. Each batch binds the category, original-dated structured signals, source-read health, GitHub source SHA/run and actual signing time. A category may have zero eligible recent releases; that is never represented as current news.
4. The existing Ed25519 signer/public registry supplies key matching, validity windows and revocation handling. Domain-separated canonical bytes use `geomacro.automated-finds.v1\n`; these objects are not GROs or independently reviewed inputs. Retired/revoked keys cannot create a new production batch.
5. Current signed results persist in D1 on each collection. B2 is a verified backup at most once per six-hour observation window: the existing shared account permits only 25 GET/day across all producers. The governed client writes gzip under `geomacro-evidence/v1/automated-finds/latest.json.gz`, fetches exact bytes and verifies SHA-256 plus bounded restoration. Every attempt reserves the existing shared quota ticket; the job budget is 12 calls. No quota increase or raw-source archive is introduced.
6. The authenticated D1 route independently verifies every signature against public verification keys provisioned by the protected deployment workflow. One existing `control_state` slot stores the bounded snapshot; no migration is needed. Atomic ordering rejects older runs and altered equal-time replays. Only an actual exact B2 restore grants the current batch's archive proof. Between backups, or after a failed backup, the current D1 batch explicitly has `full_b2_readback_verified=false`; the separately dated prior archive checkpoint is preserved. An older backup is never presented as proof of the new batch. Failed backups remain visible and back off six hours while signed D1 updates continue.
7. An independent public GET proves exact D1 readback against the newly signed payload hash. Reads reverify signatures, original-date gates and the two-hour batch lifetime. Polling, signing or restoration never resets a source date. Current 24h counts are computed from source dates on every read. A two-hour collection outage makes signed serving unavailable; an original news drought gives a valid batch with an honest zero current count. A prolonged outage may prevent recovering the last backup-attempt clock; the shared atomic quota guard still bounds every actual B2 attempt.

## Existing APIs

After website publication:

| Endpoint | Scope |
| --- | --- |
| `GET /api/v1/intelligence/query?view=finds` | All three signed category batches |
| `GET /api/v1/intelligence/geopolitics?view=finds` | Geopolitics |
| `GET /api/v1/intelligence/macro-fx?view=finds` | Macro/FX |
| `GET /api/v1/intelligence/critical-minerals?view=finds` | Critical Minerals |

The directly deployed Worker serves the same verified results at `/v1/public/automated-finds`, optionally with `category=geopolitics`, `macro`, or `rare_earth`. The API preserves each complete signed batch when filtering categories. Unknown parameters fail closed. This bounded rolling journal does not claim a country-specific on-demand answer; existing 195-country discovery and governed POST behavior remain unchanged.

The same existing `RISK_OBJECT_SIGNING_*` and verification-registry secrets are reused in the protected continuity job. Only public verification material enters the control-plane Worker; private signing keys stay in the protected publisher. A successful control-plane deployment triggers the existing continuity workflow after deployment, avoiding a permanent first-publish dependency race. GitHub cron is best effort, not a realtime SLA.

## Explicit product separation

`independent_reviewed`, `scored` and `chargeable` remain false. This path does not promote a paid object, approve source rights, create a reviewer identity, change x402 prices, or unlock settlement. Existing independently reviewed Intelligence/GRI/Risk Indices publishers and their freshness/signature/rights checks are preserved. The default `/api/health?deep=1` still tests those products; it must remain HTTP 503 while they are unavailable. A healthy automated Finds feed is not evidence that those signed products recovered.

The website's existing derived journal and fallback continue unchanged. Newly added website `view=finds` handlers require Lovable Publish changes; the directly deployed Worker does not depend on that manual publish.

## Missed-tick signed recovery

The existing cadence backstop must run the same signed Finds stage as the primary collector, not just update the unsigned derived journal. Both writers share one concurrency group and the existing D1-governed B2 budget/six-hour archive cadence. The backstop resolves that ledger before publication and independently verifies combined plus each category signature and exact source SHA. No TTL or original publication time is extended. A successful master source-runtime run also checks whether catch-up is due, without adding another schedule or chaining the master to itself. GitHub schedules remain best effort.
