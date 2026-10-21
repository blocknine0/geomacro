# Geomacro worldwide commercial source-rights intake and private approval queue

**Date:** 21 October 2026  
**Scope:** all **submitted** original publisher observations, from all 3 domains and any of 195 countries. This is an executable rights *planning, deduplication and permission-request generator*, not permission creation, publisher consent, factual certification or a signed GRO.

## What can be fully automated, and what cannot

Geomacro can license the original parts of its **own** structured output under the pre-existing `geomacro.owner-derived-output-commercial-grant.v1` (see `docs/COMMERCIAL_DERIVED_OUTPUT_OWNER_LICENSE.md`). This does not convey rights in a third party's article, database, compilation or trademark. Published access, official-source status, not charging for an API, a page being crawlable, a custom Geomacro license or a successful fetch cannot legally create a publisher license.

The private rights engine `scripts/lib/geomacro-rights-intake-autopilot.mjs` accepts evidence SHA256 references and publisher IDs, groups by one same-event claim, and removes:
- exact repeated article bytes across all sources;
- reused original issuer URLs even when the HTML changes;
- same original issuer republishing the same claim, including syndicated headlines.

Independent *candidate* issuer count is preserved (no automatic semantic corroboration). Fake/expired/future-dated originals are disqualified from **current** GRO consideration. Two independently originated eligible originals are a *candidate*, not a signed Facts proof.

Each unique original has an executable rights state:
- `PUBLISHER_OR_DATASET_PERMISSION_REQUEST_REQUIRED`: unknown source or no reviewed exact dataset license; a private precise-article permission request is generated, **not an approval**.
- `ATTRIBUTION_INCOMPATIBLE_WITH_PRIVATE_DELIVERY`: source license allows some commercial use *with attribution*, but the existing Geomacro paid contract hides source names. Do not omit required credit. Negotiate an actual written no-attribution exception from the rights holder, change the product disclosure contract with customer consent, or exclude this original.
- `ARTICLE_SCOPE_RIGHTS_DOCUMENT_REQUIRED`: known source dataset terms exist without attribution restriction; the specific article/page and any third-party materials still require validation.
- `ARTICLE_SCOPE_PROOF_FOR_INDEPENDENT_RIGHTS_REVIEW`: supplied document metadata matches article SHA/time/scope and is ready for **separate genuine Rights authority review**, not approved.
- `ORIGINAL_TOO_OLD_FOR_CURRENT_GRO`: not eligible as freshly signed current GRO even if historic rights are sound.

The initial reviewed catalogue contains approximately a dozen exact datasets, many subject to attribution obligations. Country directory entries (**779 copied privately to D1**) are discovery pointers, **not 779 licensed original article feeds**; each new original still requires its own license and rights evidence. Source pages can change licensing independently of published cached source metadata.

## Run the source inventory anywhere, zero cost and no credentials

```sh
node scripts/ops/run-geomacro-rights-intake.mjs --catalogue
node --test scripts/lib/geomacro-rights-intake-autopilot.test.mjs
```

The first output contains only aggregate counts and explicit `article_level_permissions_created:0`. Do not interpret a reviewed catalogue record as actual no-attribution commercial article permission.

## Run on genuine original candidates (owner-private Linux/WSL)

Store owner-private JSON at an **absolute path outside the repo**, readable only by your account (directory 0700; files 0600). Do not include actual article HTML, token, original text, rights-owner private keys or permission-document bytes in the file. Only the exact original's URL and SHA256, native publication timestamp, true original issuer identity, exact same-event claim hash, country and category plus *optional* independently sourced permission-document **hashes** belong here.

```json
{
  "schema":"geomacro.private-rights-intake-request.v1",
  "originals":[{
    "source_id":"REAL_SOURCE_REGISTRY_ID",
    "originating_organization_id":"GENUINE_ISSUER_ID",
    "original_url":"https://publisher.example/release/real-event",
    "original_article_sha256":"64_lowercase_hex_from_actual_verified_HTML",
    "same_event_claim_sha256":"64_lowercase_hex_verified_same_event",
    "category":"geopolitics",
    "country_iso3":"USA",
    "original_published_at":"2026-10-21T11:00:00Z"
  }],
  "permissions":[]
}
```

This example is **schema documentation only** and will be rejected unless hashes and real clocks are valid. Do not input fake hashes as actual results.

```sh
chmod 700 /secure/geomacro-rights
chmod 600 /secure/geomacro-rights/originals.json
node scripts/ops/run-geomacro-rights-intake.mjs \
  --input=/secure/geomacro-rights/originals.json \
  --out=/secure/geomacro-rights/queued-rights-review.json
```

The per-item owner-private JSON result contains exact original/article SHA, a bounded permission request specifying **commercial derived use without raw republishing or mandatory public attribution**, and the actual pending state. GitHub Actions prints only redacted counts, never publisher URLs/identities, raw articles or requested permission documents. An external rights holder's positive license must be received and lawfully applicable to the exact article; Geomacro does not sign on their behalf.

## Automated continuation once genuine permission exists

Use existing trusted code instead of inventing another weak signer:

1. Fetch actual first-party source bytes over strict issuer-pinned HTTPS and compare exact SHA256/native published clock (`verifyGeomacroTwoOriginalMachineBinding` or the existing separately controlled single-original path). Repeat independently; dedup cross-issuer.
2. Read the actual, scope-correct rights-holder grant or independently reviewed public-domain exemption. Bind its byte SHA256 and license scope SHA256 to each article. Ensure no attribution or resale requirements are ignored. If an attribution requirement conflicts with source-private output, block the item.
3. Issue independently validated Facts and Rights approvals through two separately protected signer roles by `scripts/ops/issue-offline-machine-commercial-proof.mjs` and `scripts/lib/geomacro-offline-machine-issuer.mjs` using pre-approved **distinct** real Ed25519 keys. The machine Facts signer must truly check semantic same-event evidence and counterevidence; the machine Rights signer must separately review the **actual** legally relevant license material. No role is allowed to fabricate a publisher grant or self-approve its own permission.
4. Verify both signatures against pinned public keys and run `scripts/ops/accept-private-geomacro-machine-commercial-gro.ts` with the existing third, distinct production GRO signer. Private keys stay in separate non-repo custodial workspaces.
5. Only then permit existing `scripts/ops/publish-private-signed-gro-d1.ts` to perform protected B2 exact PUT/GET SHA readback and D1 hot promotion, subject to real evidence freshness, commercial license scope, quota budget and product-specific acceptance. Each event may update more than one category only where the independently validated event ontology actually supports that category.
6. Reject any missing permission, signature, native clock, source authenticity, genuine independent corroboration or current GRO TTL. Let the free research feed continue unscored.

**Important:** The existing two-role offline private key custodians must actually hold approved keys and legal grants. This PR does not generate fake signing keys or sign all articles. A valid source-wide *plan* cannot substitute for verified signatures.

## Periodic rights monitoring

`.github/workflows/source-rights-intake-observer.yml` runs no-secret negative tests on PR/main and probes the existing **exact source-terms URLs** once per week with at most 16 GETs, max 128 KiB each. It logs aggregate status and SHA256-only term observations, **does not** update rights labels or grant permission, and uses no Supabase, D1 writes, B2 operations or funds. Any changed official terms requires fresh legal interpretation; lack of a readable public license page is NOT approval.

## Owner's next external action

For unknown or attribution-restricted sources, issue actual permission requests to the rightful publisher/dataset owner using the generated exact-article request scope. A helpful email draft for the Geomacro business account:

> Subject: Request for commercial derived-facts use rights (specific original release)
>
> We request non-exclusive written permission to use factual developments from the identified original release solely to generate Geomacro-authored structured geopolitical, macro/FX and/or critical-minerals analysis delivered commercially to partner applications. We will not redistribute article text, images, original headlines, publisher datasets or raw feed payloads. Our intended delivery does not reveal upstream source identities; please explicitly confirm whether this no-public-attribution treatment is permitted and any conditions, limitations, duration or required credit. This request does not assume permission has already been granted. Please identify the precise work/dataset and the legal rights holder.

No email has been sent to upstream rightsholders by this PR. An approval is effective only after an authentic answer/terms review and exact article rights binding.

## Production acceptance verdict

`INTAKE_AUTOMATION_READY` is a code/test conclusion only. It does **not** mean `THIRD_PARTY_RIGHTS_APPROVED`, `FACTS_RIGHTS_SIGNED`, `CURRENT_COMMERCIAL_GRO_SIGNED`, `GRO_HOT_PUBLISHED` or `PREDGE_PAID_RISK_GATE_READY`. No payments or customer access changes.
