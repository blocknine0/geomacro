# Phase 2: effective B2 capacity and hot-503 recovery priority

Current account D1 conservative safety envelope stays EXACTLY
`80 total / 25 GET / 55 PUT / 10 HEAD / 10 native auth` per UTC day.
Do not present this as actual provider usage, and do not increase it
without independent Backblaze provider cap/paid-usage approval.

On 19 October 2026 the read-only D1 receipt showed 25/25 GET reservations,
of which 13 were private structural serving, 5 private source rights,
4 public Intelligence edge, 2 public Global Risk edge and 1 Free Finds.

This change increases **effective useful read capacity** rather than
changing the account-wide hard limit:

- Structural snapshot and proof bytes use bounded 15-minute in-isolate
  caching instead of 2 minutes. Each read still independently verifies
  compressed SHA, source-project identity, exact original generated_at,
  expiry, country identity, qualified observation and rights gates.
  No current source date is invented or freshness TTL extended.
- Account-wide atomic D1 UPSERT now enforces **low-priority** caps:
  structural app reads can proceed only while global GET reservations
  are <=10; app private status/rights GETs only while global GET
  reservations are <=18. Other producers, signed review, and immutable
  original-version recovery keep access to the 25/day envelope. The
  public edge already had a global ceiling of 10. No wallet or external
  API can change these ceilings.
- Backblaze account-wide 403 transaction_cap_exceeded or
  download_cap_exceeded latches B2 structural cold reads until the
  next UTC day. A different credential for the same account may not
  bypass an account-wide cap. Generic AccessDenied can still use
  the existing authorized backup read credential.
- Actual D1 tickets are still reserved atomically before each B2
  network operation. Cache hit does not consume a ticket. Cache miss
  when D1 denies is not routed around D1.

Backblaze documents Class A/B/C calls free on **pay-as-you-go** accounts,
but also explicitly documents transaction caps for non-paying accounts:
https://www.backblaze.com/cloud-storage/transaction-pricing
https://www.backblaze.com/apidocs/b2-authorize-account
A no-card account is not known to be eligible for increased B2 limits.
Only the account holder can review Caps & Alerts or request a support
exception; neither code nor new S3 credentials raise its transaction cap.

Historical GRI immutable-original SHA readback was proven in the existing
protected run 38953797441; that is still a HISTORICAL-only proof. The
already-present historical D1 restore workflow is preferred over repeat
B2 downloads. Signed current GRI remains blocked until real independently
reviewed recent evidence, rights and distinct country-category approvals
exist. This patch does not mint any of those, reactivate Supabase, change
capability prices, relax x402 protections, move signed hot data, or spend
USDC.

New local tests: quota protection under concurrent bursts; permitted
recovery operations with hard ceiling intact; provider cap denial latch
and bounded cryptographically revalidated byte cache.
