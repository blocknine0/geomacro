# GeoMacro product-scoped baseline vs paid-live deep health

## Public health contracts

- `GET /api/health?deep=1` remains the **strict paid-live** contract. Each of intelligence, global-risk and risk-indices requires original `source_as_of` no older than 60 minutes, approved signed/current objects where applicable, and independently verified exact B2/D1 readback. When any proof fails, HTTP 503 **continues**. Never replace source time with scheduler time.
- `GET /api/health?deep=1&profile=verified-baseline` is a separately labelled **read-only baseline** service profile. It independently probes real historical/last-verified B2/Edge objects. HTTP 200 is returned only if at least one original verified baseline is actually readable; otherwise 503. The response explicitly enumerates which products are verified baseline, which are verified *current*, and `degraded:true` unless all three signed-live proofs pass.
- `GET /api/health?deep=1&profile=live-structured` retains the existing ephemeral unsigned source-observation profile. It cannot issue GRI, GRO or paid intelligence.
- `GET /api/health?deep=1&profile=free-derived` remains separate. It cannot stand in for signed current products.

## Genuine reviewer-signed GRI cycle

A 30-minute `global-risk-cadence.yml`, 15-minute `gri-signed-ready-cadence-backstop.yml` and 30-minute `risk-indices-verified-parent-backstop.yml` already operate on exact main. Their successful *execution* does not claim that a B2/D1 publication occurred.

For a genuine reviewer publication, independent authorized reviewer(s) must place **actual** exact bytes in the existing private governed B2 keys:

- `geomacro-evidence/v1/private/reviewed-gri-current/<sha256>.json`
- `geomacro-evidence/v1/private/reviewed-country-certification/<sha256>.json`

Supply `GRI_READY_REVIEWED_SHA256`, `GRI_READY_CERTIFICATES_SHA256`, and the real fresh `GRI_READY_APPROVED_AT` (UTC) via the approved protected environment. The backstop merely requests the existing `gri-v12-supabase-free-reviewed-current.yml` publisher. That workflow independently checks immutable bytes, reviewer identity/signature, country certificates, approved owner policy, original native clocks, source and item rights, and quota-governed B2/D1 publication/restore. The indices workflow only consumes a proven current GRI parent.

No reviewer input, signature, source-date, live proof, item permission or settled payment can be manufactured or substituted by this change. PREDGE, pricing, historical storage and existing merchant rails are unaffected.
