# Unified Risk Gate: permanent 207-cell daily acceptance and bounded recovery

Status: production code from PRs #3415-#3417 deployed; this patch adds missed-slot retry.
The 195-country canonical registry excludes supplementary on-demand Taiwan (TWN).
Canonical census target is **195 country daily snapshots + 12 strategic corridors**.
Each snapshot contains **three** category fields (GEOPOLITICS, MACRO_FX,
CRITICAL_MINERALS); 207 snapshots do **not** imply 585 verified category scores.
Unknown or unverified risk stays null and hard gate stays insufficient evidence.

## Data plane

- Worker: geomacro-control-plane on Cloudflare.
- D1 binding: DB. Do not execute examples against the nonexistent
  geomacro-production-d1 name.
- D1 migrations: 0108_unified_risk_categories.sql and
  0109_unified_risk_generation_attempts.sql. Existing protected deploy workflow
  applies migrations remotely and confirms schema and deployed exact source SHA.
- Supabase private project contains public.geomacro_unified_risk_daily with
  RLS enabled, no anonymous/authenticated privileges and service_role-only REST.
- No RISK_GATE_UNIFIED_TOKEN required. The unified route reuses purpose-scoped
  RISK_GATE_TIERED_TOKEN; never paste bearer or HMAC keys into source or chat.
- Direct control-plane endpoint: POST /v1/risk-gate/unified/evaluate.
  api.geomacro.live DNS/proxy routing is not certified by the deploy canary.
- Owner-admin-only acceptance routes:
  POST /v1/internal/risk-gate/unified-acceptance (TWN/CHN/Bab el-Mandeb);
  GET /v1/internal/risk-gate/unified-census (195+12 aggregates).
  These are **not** customer-accessible or payment-authorized.

## Production schedule (UTC, existing Worker 1-minute cron)

- 05:00–08:14: one canonical country/minute, all 195.
- 08:20–08:31: one registered corridor/minute, all 12.
- 08:32–17:29: select one missing canonical snapshot per minute from D1;
  rotate start index and cap each target to three attempts/day, with a minimum
  15-minute retry interval. An attempt is registered atomically in D1 before
  external source fetch. Corrupt D1 snapshots are not silently replaced.
- Every 15 minutes (minute 10): Supabase upsert bounded to six pending rows,
  per-row remote content-hash readback, D1 sync mark after successful check.
- Daily at 18:30: signed-protected GitHub no-funds census MUST report exactly
  195 countries + 12 corridors, each Supabase-confirmed; failure is visible.
- Every 10 days, at first due 08:35 tick: remove Supabase records older
  than three days; confirm empty old-row readback before D1 pruning.
  Never delete fresh records just to simulate a cleanup acceptance.

## Correct Supabase operational query

```sql
SELECT entity_type,
       COUNT(*) AS total_records,
       COUNT(*) FILTER (WHERE snapshot->>'unified_risk_score' IS NOT NULL) AS scored,
       COUNT(*) FILTER (
         WHERE snapshot->>'assessment_status'='INSUFFICIENT_VERIFIED_CATEGORY_COVERAGE'
       ) AS incomplete,
       COUNT(*) FILTER (
         WHERE snapshot->'categories' ? 'GEOPOLITICS'
           AND snapshot->'categories' ? 'MACRO_FX'
           AND snapshot->'categories' ? 'CRITICAL_MINERALS'
       ) AS all_three_category_fields
FROM public.geomacro_unified_risk_daily
WHERE day_utc = (now() AT TIME ZONE 'UTC')::date
  AND NOT (entity_type='COUNTRY' AND entity_id='TWN')
GROUP BY entity_type;
```

## Acceptance boundaries

HMAC protects **snapshot integrity**, not event truth, rights or GRO Ed25519
issuance. Signed GRO must independently verify before a category receives
verified scoring. Currency exposure and mineral relationships are never
inferred merely from a corridor RSS headline. Customer billing remains off.
Missing 207 daily snapshots or stale/failed source fetch must raise alarm;
do not label missing coverage as a successful production data run.
