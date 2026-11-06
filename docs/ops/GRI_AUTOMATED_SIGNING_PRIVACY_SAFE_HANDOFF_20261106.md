# Automated GRI policy signing: privacy-safe handoff (2026-11-06)

## Current state and scope

GeoMacro's Pallab/Suman **one-time GRI policy consent** is already enrolled and unrevoked. It permits automated policy checks and, subject to separately verified source/Facts/Rights/history/country eligibility, canonical GRI recomputation. Enrollment **does not** authorize a public GRI publisher, invent an independent reviewer signature, confer upstream rights, or turn internal triage into certified indices.

The former `cloud-derived-only` job remains held by its existing privacy lock. Its design would read GeoMacro's privileged original-page verdict receipt in a delegated machine job without the source owner's authentication. Removing `false &&` is not an acceptable fix.

## Restored autonomous machine signing

The existing `Standing Delegated Derived Contract No Funds` hourly / news-wakeup job now uses a **different** bounded and separated path:

1. The existing owner/issuer job automatically signs and independently re-reads the derived-news publication ledger. Its original verdict receipt exists exclusively at `RUNNER_TEMP/owner-only-verification.json`, mode 0600, and never becomes an artifact.
2. With the already registered issuer Ed25519 key, `bridge-gri-safe-machine-audit.mjs --emit-neutral` signs only an allowlisted count of derived signatures, exact main SHA, Actions run ID, timestamp and hard-coded **negative** certification/rights/numerical flags. No source identifier, original URL, article text, category-specific source verdict, private original proof, monetary data or credential is copied.
3. A same-run, one-day GitHub artifact carries only that newly signed source-neutral receipt. The owner-only original receipt is destroyed even when a later job fails.
4. The separate `gri-source-neutral-consented-signing` job has only the **public** issuer key, the existing signed two-person consent policy and the two already scoped machine signing identities. It has no issuer signing key, source/original bearer token, B2 credentials or payments token. It verifies issuer signature, exact main SHA, run ID, fixed schema, freshness, revocation, distinct keys and genuine two-person consent before producing two independent policy signatures.
5. The signed machine audit is retained for three days and leaves no private original details in the artifact. Source continuity, true current GRI and paid availability are **not** inferred from this receipt. Existing production clock/quota/source gates remain fail-closed.

### Validation

```bash
node --test scripts/lib/gri-safe-machine-policy-bridge.test.mjs
node --test scripts/tests/automated-approval-continuation.test.mjs
node --test scripts/tests/standing-derived-cleanup-contract.test.mjs
node --check scripts/ops/bridge-gri-safe-machine-audit.mjs
```

A successful source-neutral machine signature proves only **derived issuer coverage + scoped consent**. The GRI numerical publisher still needs genuinely verified current original evidence, independently sufficient country/category evidence, source terms, exact historical B2 SHA lineage and a distinct authorized numeric scoring/certification profile. The existing **human-review** GRI v1.2 endpoint will not accept this machine policy audit as Suman's per-batch human signature. A separately labelled and fully validated automated numerical profile is needed before automatically issued machine-scored readings may appear on the Risk Indices page. Do not loosen the current reviewed GRI endpoint or represent an archived score as fresh.

No additional news provider, Supabase service, paid processing, D1 write, B2 request or source-rights permission is introduced by this handoff. No new human consent is needed for this **already permitted audit scope**.
