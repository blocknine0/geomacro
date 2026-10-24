# Automatic commercial news qualification — no fabricated approval (24 October 2026)

## Production truth and automation boundaries

Geomacro has two distinct automated gates. The five-minute source news producer,
its separate LOW original-page reviewer, and the complete retained-news
coverage contract are scheduled on GitHub. The LOW signature verifies exact
original HTML bytes and the publisher's native publication timestamp only.
It cannot assert that article claims are true, independently confirmed, or
legally reusable without attribution.

An **additional** machine commercial workflow now accepts a batch of already
genuine, independently Facts/Rights-attested country-event requests and calls
the existing canonical commercial qualifier for each request. No operator needs
to run the one-event command manually for each valid proof. No unconditional
commercial approval, hidden issuer name, waived publisher licence, paid API
entitlement or source freshness extension is created. This is not a new news
engine, paid data feed, Supabase or alternate pricing system.

## Protected use

The separate trusted Facts and Rights custodians must FIRST supply genuine
same-event, independent issuer originals, real exact page bytes and native
clocks, a correctly scoped reusable legal permission for EACH source, and
two distinct existing approved Ed25519 attestations. The protected
commercial signer must have its existing valid secret and approved public key
registry, as required by
`scripts/ops/accept-private-geomacro-machine-commercial-gro.ts`.

All input/output lives in the same external 0700 owner-private directory
configured by `GEOMACRO_PRIVATE_REVIEW_DIR`. Each input is a 0600 regular
file named `<opaque>.machine-commercial-request.json` with the exact existing
`geomacro.private-machine-commercial-request.v1` schema. Do **not** put
private signed proofs, original URLs/HTML, private keys or issuer rights records
in GitHub commits or Actions artifacts.

Execute in the trusted environment with Bun already installed:

```sh
bun scripts/ops/process-automatic-private-commercial-news.ts --once
```

The processor scans up to 60 existing requests, detects repeated event
identities, calls the original real machine commercial source-byte/rights/
signature checker, prepares only successfully verified CANONICAL signed GROs
as 0600 `<opaque>.machine-commercial-prepared.json`, and emits only redacted
counts. Invalid/denied proofs fail closed and remain retryable; repeated event
requests are not signed twice in one batch. An existing prepared artifact is
**not** revalidated as current and never counts as a new qualified product.

The CLI does NOT automatically publish to production or touch money. To
promote an accepted result, separately use the existing
`scripts/ops/publish-private-signed-gro-d1.ts` only with the already required
explicit owner publish authorization, quota checks, exact B2 PUT/readback,
canonical signature verification, D1 transaction/readback and product policy.
The existing x402 payment gate must remain separate and unchanged. Do not
place both independent Facts and Rights private attestation keys into a
single public web process merely to make all news appear green.

## Honest status of the full unattended chain

- **Implemented on main after PR #2831:** each retained D1 derived item is
  automatically accounted for as previously original-source verified,
  independently checked/pending or trusted rejected cooldown.
- **Implemented by this change when merged:** batch preparation automatically
  evaluates EACH supplied dual-signed commercial request and, when evidence
  passes, prepares a signed private canonical commercial GRO.
- **Not yet connected or proven:** a hosted protected feed of genuinely
  independent SAME-EVENT Facts/Rights-signed proof packages into this private
  inbox; continuous three-category licensed source coverage; automatic
  approved B2/D1 hot promotion; three signed hot products, actual deep health
  200 or x402 live payments. A green contract test does not establish these.

No system can guarantee that every upstream item qualifies: an unreachable,
incorrect, fabricated, stale, contradictory or contractually restricted
article must remain `PENDING` or `REJECTED`, not be sold as verified data.
