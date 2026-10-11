# Telegram → Geomacro three-domain PRIVATE research lead feed

**2026-10-11; private, human-reviewed lead input — NOT automated third-party channel scraping, current signed intelligence or paid news.**

## What is genuinely connected

- The source intake now accepts `geomacro.private-human-telegram-research-batch.v1` with up to **48** individually attested human Telegram references.
- Existing `verifyInternalResearchPointer` rejects Telegram raw text/media, source URLs, session tokens, unapproved automated-collection claims, fake verified timestamps, scoring/commerce flags, future-dated and malformed categories/topics.
- Valid references enter the same 3-category PRIVATE source intake as `telegram_research`, separately from the 152 source-registry discovery entries. Each receives only a 32-hex hashed reference and truthfully labelled `TELEGRAM_HUMAN_REFERENCE_PENDING_OFFICIAL_ORIGINAL_REVIEW` (or `...HISTORICAL_NOT_CURRENT`).
- The next human/independent review uses existing `scripts/build-telegram-manual-research-review.mjs` to request original OFFICIAL publisher links. Those are **claimed** until fetched/rights reviewed and can never act as the two-source signature by themselves. Only `qualifyIndependentSameEvent` with a trusted Ed25519 reviewer, genuine same-event distinct original publishers and rights receipts can admit derived scored content; B2/D1 GRO/current website/x402 proofs remain separate.

**Production observed:** latest private catalog workflow #38116747063 synced 152 Telegram candidate registry entries via private GitHub token, but **all 152 are unauthorized**. Previous Telegram B2/D1 consumer queue #38100399603 returned `NO_PENDING_AUTHORIZED_LEADS`. An installed `TELEGRAM_SESSION` + API ID/Hash is only Telegram login, NOT publisher collection grant. No automated third-party channel feed is active; this work cannot create fresh signed news by itself.

## Manual WSL operator handoff (only if you personally observed a public post)

Use the existing strict pointer contract, see `docs/TELEGRAM_INTERNAL_RESEARCH_HANDOFF.md`. Create a JSON file **outside either GitHub repo** such as `~/geomacro-private/private-research-pointers.json`:

```json
{
  "schema": "geomacro.private-human-telegram-research-batch.v1",
  "pointers": [
    {
      "schema": "geomacro.telegram-human-research-lead.v1",
      "reference_id": "tgresearch_<32 lowercase hex characters>",
      "reference_sha256": "<64 lowercase hex characters from a privately stored reference>",
      "category": "GEOPOLITICS",
      "topic_code": "SANCTIONS",
      "country_iso3": "IND",
      "source_native_published_at_claimed": "<actual UTC claimed timestamp, e.g. YYYY-MM-DDTHH:mm:ssZ>",
      "observed_at": "<actual UTC observation timestamp>",
      "historical_reference": false,
      "source_kind": "PUBLIC_TELEGRAM_MANUALLY_VIEWED",
      "reference_registered": true,
      "human_reference_attested": true,
      "source_native_time_independently_verified": false,
      "automated_collection_authorized": false,
      "has_source_message_payload": false,
      "verification_status": "UNVERIFIED",
      "editorial_status": "PENDING_INDEPENDENT_RESEARCH",
      "scoring_eligible": false,
      "commercial_eligible": false,
      "public_published": false
    }
  ]
}
```

Only set `human_reference_attested=true` if you personally made and registered the reference. This is a **template, not a ready-to-use claimed event**, and values must be the actual reference/time, not placeholders or sample fabricated claims. No raw Telegram content, post URL, publisher alias, username, contact, session, OTP, API hash or full headlines in this JSON.

On WSL or another trusted local machine:

```bash
chmod 600 ~/geomacro-private/private-research-pointers.json
export TELEGRAM_PRIVATE_RESEARCH_POINTERS_FILE="$HOME/geomacro-private/private-research-pointers.json"
node scripts/ops/assemble-private-all-source-intake.mjs
unset TELEGRAM_PRIVATE_RESEARCH_POINTERS_FILE
```

The actual `source_refs` remain in the local `artifacts/private-intake/catalogued-source-intake.json` (0600). **Never commit, copy, upload or publish it**. By default the scheduled GitHub intake workflow does **not** receive this local private file and will continue to truthfully show 0 manually reviewed leads. To keep records out of GitHub, run this locally only and delete artifact after use.

## What is still needed for an automatic Telegram feed

Third-party public channels require a genuinely permitted API collection/use basis and exact approved publisher/Telegram authorization scope. The collector in `blocknine0/geomacro-telegram-signals` is already implemented and uses read-only MTProto with `TELEGRAM_SESSION`; it remains fail-closed until individual channels pass governed approval. Bot API channel posts require being deliberately added as an authorized bot by its publisher. Neither login nor assigning operator `YES` grants rights.

No Telegram research pointer or authorized Bot API message automatically becomes current `verified_b2`, a signed GRO or a paid x402 response. This separation protects the canonical source trust pipeline and prevents bad data being sold.
