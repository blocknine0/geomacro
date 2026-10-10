# P3.1 — country × three-domain signed independent original-event evidence census

**Implemented as an independent PRIVATE source-review diagnostic, not as 195×3 commercial readiness.**

There are two different audits which must never be conflated:

1. \`scripts/ops/audit-free-three-domain-country-gaps.mjs\`: one daily read-only D1 request to enumerate **250 geographic ISO3 × three categories = 750 source-metadata cells**. These tell an operator which certified source rows/metadata verification clocks need work. Source certification **does not establish that any original event happened**, or that the same event has independent corroboration.
2. \`scripts/lib/trusted-country-event-evidence-census.mjs\`: counts **only real reviewed event packages** which pass the existing \`qualifyIndependentSameEvent\` function with a separately configured trusted Ed25519 reviewer public key. This re-checks source URL/origin organization identity, distinct independent publishers, native first-party article clocks, original-byte and rights receipts, event identity/country/commodity consistency, counterevidence review, customer-derived row binding and actual review signature. It **does not** re-label historical country metrics as 30-minute news.

The independent reviewer-signed event package already bound \`event.country_iso3\` to the claim and originals, but the compact \`qualified[]\` metadata receipt discarded the country and source-native time. This change adds:
- \`country_iso3\`
- \`native_event_occurred_at\`
- \`latest_independent_original_at\`

All values come from the **verified and reviewer-signed same-event package**, not a separate publisher domain, inferred index, reporter location, Telegram text or third-party country list. Country attribution respects the existing canonical **194 sovereign / 53 territory / 3 special entity** classification.

## Offline private run

Prepare a private local file **outside the repository** with:

    { "rows": [<approved exact derived customer row>],
      "eventPackages": [<matching trusted reviewer-signed PRIVATE full event package>] }

Do not post this package in GitHub, Actions, ChatGPT, website content, or an external model. Keep the trusted independent reviewer public key in a separate file also outside the repository.

    node scripts/ops/audit-trusted-country-event-evidence.mjs \
      --input=/private/reviewed-evidence.json \
      --reviewer-key=/private/independent-reviewer-public.pem \
      --out=/private/new-review-country-ledger.json

The tool refuses repository-local, symlink, oversized, malformed, unsigned or mismatched inputs; writes a new private owner-only JSON receipt without overwriting existing reports, prints aggregate status only, and never sends data or performs B2/D1/Supabase/model/x402 requests. For an independently accepted event, the resulting ISO3×category cell shows a **reviewed original-event candidate**, not a current signed GRO. A zero-row private package yields all 750 cells \`NO_CURRENT_SIGNED_INDEPENDENT_EVENT\`, **not** a claim of zero risk or no news globally.

The signed private qualification receipt includes a digest but the full source material stays internal. Machine-readable positive counters cannot be constructed merely by setting \`publisher_authorized\`, copying a URL, using another organization's feed, or adding fields to public API JSON.

## Commercial admission boundary still OPEN

Original issuer rights, country mapping and native timestamps remain separately auditable facts. A trusted human-signed attestation establishes only **editorial source review**. The following remain distinct production acceptance gates:

1. Verify same-event original corroboration in real production (no synthetic test fixture evidence).
2. Canonical scoring/severity and current signed GRO; active signing key and hash verification.
3. Verified Backblaze B2 write **and actual full readback/restore**, D1 current hot checkpoint, expiry and independent production consumer verification.
4. Website's three-category Intelligence and the three x402 domain APIs must serve only exact current verified signed derived objects; unsupported/stale requests fail closed **without payment**.
5. Actual country×domain numerators and denominators must be visible. A 30-minute source monitor being healthy is not global original news coverage.

\`x402_charge_authorized=false\` and \`real_time_195x3_commercial_intelligence_verified=false\` in this private census **even when all signed source reviews pass**, by design.

## Zero additional mandatory infrastructure spending

The census uses Node's standard library and existing reviewed-event data, no new provider, new DB, Supabase writes, paid AI calls, B2 transfer or recurring Telegram harvesting. The daily D1 source-metadata ledger and existing official publisher cadence are separate; run this signed review census only when the trusted publisher has real qualified new original events.

**Acceptance:** a private reviewed-event-positive cell may be displayed as \`SIGNED_REVIEW_ACCEPTED_NOT_HOT_SERVING\` (not "live" or "paid") until outside-in current GRO, B2/D1 and x402 proofs are independently validated. The master #1827 P3.1 stays open until that exact end-to-end proof passes for the actual claimed country/category scope.
