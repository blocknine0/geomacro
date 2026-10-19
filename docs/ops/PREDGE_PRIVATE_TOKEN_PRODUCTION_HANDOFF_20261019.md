# Predge research API token: single protected grant and safe rotation

**Purpose:** free 90-day **private, noncommercial** research evaluation only.
This is not a source-license waiver, paid product, signed GRO, business resale,
Risk Gate execution approval or an external partner consent receipt.

## Already working (independent evidence)

Cloudflare deploy run 39280129880 on 19 Oct 2026 verified:
- 401 for anonymous private route.
- 200 for the protected dedicated research bearer.
- Exactly the same eligible derived D1 journal IDs, counts and dates as public
  Geomacro Intelligence source-neutral 72h feed.
- No per-item allowlist/approval receipt, no x402 payment, no Supabase/B2.
The proof expressly did **not** assert token transmission to Predge.

## Founder operation, once

1. On a trusted local machine generate 32 cryptographic random bytes in
   **lowercase hexadecimal**. In PowerShell 7:
   `$token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()`
   Keep this value private. **Do not paste it in an issue, PR, this chat,
   URL query or artifact. Never give the existing root ledger token**.
2. In GitHub **Settings → Environments → production → Environment secrets**
   (or **Settings → Secrets and variables → Actions → Repository secrets**)
   add `PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE` with that exact 64-character
   lowercase hex value. Existing deployment now prefers this private token
   and falls back to the original domain-separated HMAC without downtime.
3. Deploy the existing `Deploy D1 Control Plane` workflow using protected
   main's authenticated operator workflow dispatch, or merge a normal scoped
   deployment change; **do not** put the token in workflow input.
4. Require the real postdeploy `geomacro.predge-auth-live-acceptance.v1`
   receipt: 401 anonymous; 200 bearer; identical D1 IDs and counts; no
   commercial authorization; no funds.
5. Send the same dedicated token **directly** to Predge via a suitable
   end-to-end encrypted channel (or an expiring one-time encrypted secret
   share). Communicate the fixed private endpoint separately. Treat sharing
   as unverified until Predge acknowledges its own successful 200 read.
6. Rotation/revocation: update/delete the override secret and rerun the
   protected deploy. Deleting it falls back to the former HMAC secret, so
   **deletion alone is NOT secure revocation**. To revoke without fallback,
   deploy a fresh non-shared random override; never disclose fallback.

**Partner request**:
`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/partner/predge/derived-structural-72h`
with `Authorization: Bearer <dedicated token>`. Optional `?domain=macro`,
`?domain=geopolitics` or `?domain=rare_earth`. Fetch full 72h window;
deduplicate by stable `items[].id`, not publication timestamp; expected
source embargo 15 minutes. Daily UTC D1 atomic cap is 500 if pending
quota PR #2503 merges and redeploys; until then **do not assert 500-cap
production enforcement**. Suggested pilot polling 15–30 min, no SLA.

Public research GET (no token) remains available separately at
`/v1/public/derived-structural-72h`, with attribution-required records
withheld and no commercial reuse rights granted.

## Exact remaining grant evidence

External partner acknowledgment of the secure token handover and signed
pilot agreement for any non-research/redistribution use require real
correspondence, not generated test values. The older GRI/Indices B2 hot 503
and current independent reviewed inputs are separate from the working free
Predge research endpoint.
