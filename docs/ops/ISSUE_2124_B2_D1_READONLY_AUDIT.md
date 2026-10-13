# Issue #2124 — B2 to D1 legacy current-hot recovery audit

This is a **read-only diagnostic prerequisite**, not a new current signed
intelligence producer. Invoke the workflow **Issue 2124 B2 D1 current hot
read-only audit** only after main has merged this change.

The workflow uses the existing account-wide atomic D1 B2 GET quota governor.
It checks shared daily GET headroom first (eight requests), then reads each
of the three latest B2 gzip objects and companion proof objects with a
dedicated read credential. It verifies compressed hash, gzip restore, proof
binding, original evidence timestamp and age, and exact D1 hash, payload
bytes and source clock for the three commercial product families separately.

A restored old archive is not fresh scored intelligence. No Supabase query,
B2 PUT, D1 write, mutation, x402 settlement, secrets or publisher raw content
are performed or emitted. Failures stay red. In particular, an independent
current GRI proof over an older B2 baseline is *not* counted as a new directly
verified current B2 archive; it requires its own proof-verification route.

Run tests without production secrets or networking:

```bash
node --test scripts/ops/audit-b2-d1-current-hot-readonly.test.mjs
```

## Still required before closing #2124

1. Independent actually current scored + signed source evidence in each family,
   from a path that does not require the frozen Supabase source tables.
2. Supported B2 write/readback/immutable archival verification and current
   Cloudflare D1 publication, preserving original source timestamps.
3. Independent Risk Indices and Global Risk product-edge acceptance, including
   the 60-minute website lag and separate 15-minute website Intelligence lag.
4. Exact-main `/api/health?deep=1` HTTP 200 with all three current verified
   hot proofs; then separate no-funds x402 preflight.

Do not enable settlement or send funds without founder's explicit ACK.
