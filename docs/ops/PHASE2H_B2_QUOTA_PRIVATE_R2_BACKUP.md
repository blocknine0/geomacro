# GeoMacro long-term Risk Gate minimum-facts storage: Brotli 11

## Locked owner requirement

Only keep source-derived facts needed for Risk Gate decision support in the
long-term private backup, NOT full news source data. Do not keep full article
text, publisher headlines, descriptions, original HTML, full Phase2H JSON
or entire five-part GRO prose in the new cold store.

## Two retention zones

1. HOT/short-term: Existing canonical D1 and B2 source-evidence pipelines
   continue to authenticate first-party original metadata, source-native
   dates, independent corroboration and real archival ACK. Existing
   72-hour raw-evidence/7-day Risk Gate policies and physical safety holds
   are unchanged. This patch does NOT delete previous private copies.
2. COLD/long-term: Private R2 stores compact sourced risk facts only:
   identity hashes, original publication clock, ingest clock, category,
   inferred ISO3 or ZZZ, canonical original citation URL, source identity
   hash, GeoMacro-derived what (<=220 chars) and why (<=180 chars),
   watch topic (<=96 chars), 4-channel mask, observation-only status and
   one event grouping hint SHA256. No full source fields or body.
   Candidate event grouping is NEVER evidence of independent corroboration.

A canonical URL is retained only for essential source provenance, not an
article text. Unknown source evidence remains unverified; neither hashes
nor HMAC prove source truth. Certified scores, rights, GRO signatures and
7-day independent history are NOT manufactured by this backup.

## Compression and security

- Fixed-column JSON tuples, compact enum categories, bitmask market
  channels, SHA256 identities as Base64URL (43 chars vs 64-character hex).
- Strongest reviewed Brotli text compression, quality 11 with 22-bit
  window, then domain-separated HKDF-derived AES-256-GCM authenticated
  encryption and full-body provider R2 GET, AEAD-decrypt and exact
  semantic tuple comparison.
- Prefix, separate from older raw archives:
  geomacro/private/phase2h-risk-minimum-br11/v2/YYYY/MM/DD/HH.br11.enc
- Separate HMAC-protected R2 keyset cursor verifies prior actual encrypted
  object and its last source ID+UTC clock on every run. Exact one
  derived-only object per UTC hour; idempotent retry never overwrites
  divergent content.
- At most 25 input originals / 25 compact derived tuples per hourly
  operation; plaintext cap 500 KB. This is incremental and must not be
  misrepresented as a complete archive or sufficient throughput for all
  live incoming sources.
- Raw originals exist only transiently in this new backup runner memory.
  The writer serializes only risk-derived fixed tuples, never originals.
  This does not prove previous legacy B2/D1 raw copies have been removed.
- No B2 calls or bucket enumeration, no D1 SQL mutations, no public raw
  source publishing, no payment or Predge contract changes.
- R2 account-wide monthly storage/operation headroom is a separate
  capacity requirement and cannot be inferred from the bounded payload.

## Production operation

Workflow .github/workflows/phase2h-private-r2-b2-quota-backup.yml runs
hourly UTC at minute 43. Manual owner dispatch accepts only
BACKUP_PHASE2H_PRIVATE_R2_NO_B2_OR_FUNDS. Requires verified exact current
main, protected production environment and an independent real
Cloudflare R2 domain-exposure audit for the recovery and shadow buckets.
Uses previously configured private recovery R2 and AES key. Successful
provider GET/decrypt/readback yields a metadata-only receipt without
headline, body, source URL or private original IDs in GitHub artifacts.

Restore is a separate owner-reviewed action: fetch the known UTC-hour
object by key and independently authenticate/decompress compact facts.
These facts CANNOT be restored as original article JSON or promoted
into a paid Standard/Complex result absent separate source corroboration
and signed GRO/indices proofs. Preserve recovery-key history on rotation.

## Still-open B2/CANARY requirements

Production run #42867331554 applied and verified D1 0204,0211,0212,0213
but signed physical Stage2 HOLDs with
STEP3_PRODUCTION_B2_ACKNOWLEDGED_ORIGINAL_UNAVAILABLE.
Private R2 compact facts are NOT a B2 original archive ACK, B2
object census, hot/cold dual-copy proof, or independent orphan exclusion.

The existing B2 namespace predates a complete write-time inventory and
B2 listing is prohibited. Historical physical parity cannot be honestly
certified from D1-indexed GET alone; provider-authorized independent
inventory or separate proofable isolated namespace plus governed ledger
must be accepted first. Old originals may require approved expiry policy
and independently verified cleanup, never unexplained deletion.

Only a real current-main signed physical Stage2 PASS, genuine B2 parity,
immutable Worker candidate, protected 0-1-5-25-50-100% rollout and rollback,
Hot50 three-category proof, full post-rollout UTC-day quota and read-only
HOLD review permit a separate reviewed HOLD-removal PR. Until then
config/d1-hotspot-v2-canary.hold remains untouched. Payments stay OFF.
