# Genuine signed country GRO: Supabase-free private publication

Production source: `scripts/ops/publish-private-signed-gro-d1.ts`.

The public 72-hour Geomacro Intelligence and Predge **research-only**
derived-news D1 journal is already working without Supabase. This new
private publisher is the *separate* genuine commercial GRO path. It DOES
NOT sign arbitrary news, confer source-commercial rights, or allow an
unsigned / expired fixture to count as a current GRO.

## Existing authority reused

1. Genuine official original and source-native timestamp.
2. Existing private single-original/facts-and-rights authority or
   machine-commercial qualified evidence, approved under the canonical
   contract. A single independent original may be used only where the
   corresponding rights/qualification authority actually permits it.
3. The production **Ed25519 private signing custodian** signs the canonical
   GRO. This publisher receives only the signed artifact; it does not
   receive or need the private signing key.
4. Existing *pinned active* verification key, independent cryptographic
   verification, `verification.status=VERIFIED`,
   `commercial_eligibility.status=VERIFIED`, unexpired and original-evidence
   checks, with no Supabase query.
5. The exact one-object canonical JSON is archived using governed
   Backblaze B2 PUT followed by an independent full-byte GET and gzip
   restore. **No D1 promotion if B2 quota or readback fails.**
6. Single country and risk-object D1 SQL upserts with bounded parameterized
   inputs and SHA256/signed-status readback. Newer signed objects cannot
   be overwritten by older ones.

## Owner-only invocation

Run the following on a protected machine or production runner only **after**
a genuine signed/private fact-and-rights package has been produced.
Use a private file outside the repo with mode 0600 on Linux:

```bash
# Secrets are supplied privately by the protected runner; never paste
# them into source, email, chat, a GitHub workflow input or console logs.
export GEOMACRO_DIRECT_GRO_PUBLISH_ACK=YES
export B2_ACCOUNT_QUOTA_REQUIRED=1
export B2_REQUEST_BUDGET=4
bun scripts/ops/publish-private-signed-gro-d1.ts /secure/private/signed-country-gro.json
```

The run additionally requires protected
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`B2_KEY_ID`, `B2_APPLICATION_KEY`, and the existing D1 quota governor
credentials. A private machine-commercial prepared envelope containing
`canonical_signed_gro_json` is also accepted, but **only** if its
canonical signature, bound machine facts/rights and actual commercial
eligibility still verify. Signed country scope only; corridor requires a
separately accepted genuine corridor GRO. No human or system should upload
private original HTML, facts/rights certificates or private keys to GitHub
or to public news endpoints.

For genuine paid live serving: independently confirm
`GET /v1/country-gro-hot/{ISO3}` via protected Worker control-plane token,
the website public key registry, real current GRO age, the D1 Risk Gate
readiness, distinct partner bearer, and signed Predge market envelope.
There is **no real-money activation** or customer authorization in
the private publisher.

## Failure states

- Missing/wrong signer, expired evidence, falsified source rights, old
  record, untrusted self-signed object: **no B2 or D1 mutation**.
- Quota held, B2 invalid hash/restore, D1 write/readback failure: fail
  closed. Archive may have been written while D1 failed, but that is not
  a payable GRO. Retry with the exact same signed original only after
  reconciling the partial archive.
- No private input supplied today: zero genuine GRO published.
- No Supabase server or REST URL is contacted by this script.

**Migration reality:** old `scripts/ops/publish-country-gro-hot-bundle.ts`
and other historical GRIs still use Supabase; this is a new non-Supabase
publisher, not a claim that every legacy Geomacro service was removed.
