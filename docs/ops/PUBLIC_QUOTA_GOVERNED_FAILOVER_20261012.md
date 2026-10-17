# Permanent Supabase-free public serving: shared B2 quota failover (2026-10-12)

## Independently audited actual prior architecture

Geomacro public serving already has three Cloudflare Workers: Intelligence,
Global Risk and Risk Indices. Each normally reads **verified D1 hot
snapshot** before a positive Cloudflare POP cache, before a **cold B2 GET
with a globally atomic D1 account quota reservation**. The B2 shared
governor currently budgets 80 operations, 25 GETs/day overall and at
most 10 public-edge GETs (shared among the three workers), preserving
producer headroom; a refused reservation prohibits any cold B2 GET.
Verified signed/hashed public data is served only when valid, and stale
history is not converted into freshly signed intelligence.

**Root cause found:** some website, server function, health and machine
modules called `readB2PublicIntelligence()` and `readB2PublicRisk()`,
which tried those verified edges *first*, but then performed a second
independent signed S3 `readJsonGzip()` if the edge returned 503.
That bypassed the global B2 quota admission / conservative refusal
and could waste scarce free quota on every cold server process.

A separate public Intelligence function also automatically queried
frozen Supabase when edge/B2 failed.

## Fix and actual failover path

Public read-only serving of both products now exclusively reads the
already deployed Cloudflare edge authority. No public server runtime
owns an independent B2 S3 cold-read fallback. Intended priority
inside the verified Workers:

1. Cloudflare D1 SHA-bound verified hot snapshot (no B2 origin call).
2. Previously proof-validated Cloudflare POP cache, where available.
3. One bounded B2 cold origin only after a successful atomic D1 reservation
   in `workers/control-plane/src/b2-account-quota.mjs`; account-wide
   limits and producer headroom are enforced before each B2 GET.
4. Previously read-back verified immutable continuity when its valid
   contract applies (clearly historical; not automatically payable).
5. Fail closed with 503 or an empty nonpayable public intelligence view
   if none remain. No new score, signature, source publication time or
   licensing rights is ever created by failover.

The old public Intelligence automatic Supabase query has been removed
from the live public read path. An explicitly named legacy recovery
helper remains for isolated maintenance only; it must never run as
an implicit fallback for a public customer or monitor.

The permanent runtime-health Action also no longer receives S3
key secrets. Its Supabase-free B2 check now asserts **zero direct
Backblaze requests**. It verifies the underlying Cloudflare edge
products and checks all three category rows and validated GRI proof.
D1 and the Durable Object commerce ledger are separately probed
without payment.

## Availability boundaries / required operators

Independent verified POP/D1 replicas can serve through B2 free quota
exhaustion. If D1 **and** POP cache are unavailable, a new cold B2 read
cannot be safely admitted. Free-tier services cannot guarantee 24/7
real-time delivery or unlimited reads across simultaneous outages:
the safe response must remain unavailable, not unmetered S3 or
unverified archival material. No additional paid account, card,
Supabase project or second S3 identity is created here.

Original first-party article ingestion, reviewer-signed source proof,
fresh 3-domain signed GROs and payment settlement are **separate**
prelaunch tests. The website's 60-minute verified delay remains
website-only, never inserted into x402/machine readers.

Production acceptance is a passing Product CI, CodeQL and
`Permanent Runtime Health` run on main with no Supabase injected
and proof of zero public S3 calls. The domain website may still need
Lovable publication or Cloudflare deploy; code merge does not
constitute end-to-end live cutover.
