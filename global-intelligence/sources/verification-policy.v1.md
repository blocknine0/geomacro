# Source Verification Policy

## Authoritative
A source can be AUTHORITATIVE only when:
1. ownership/identity is verified;
2. the endpoint/channel is actually controlled by the institution;
3. provenance is preserved;
4. the data/message can be independently retrieved;
5. commercial/reuse terms permit the intended use.

## Telegram
Telegram source classes:
- TELEGRAM_VERIFIED: official institutional channel, identity verified and policy-approved.
- TELEGRAM_SPECIALIST: established specialist source, corroboration only unless separately approved.
- TELEGRAM_EARLY_SIGNAL: unverified or non-institutional signal.

A Telegram message does not become authoritative merely because multiple Telegram channels repeat it.

## Confirmation
Preferred confirmation order:
1. Official primary source.
2. Independent authoritative international/sector source.
3. Two or more independent credible secondary sources.
4. Telegram-only remains EARLY_SIGNAL unless the source itself is an approved official institutional channel.

## Conflicts
If authoritative sources disagree:
- preserve each claim;
- create a conflict record;
- do not silently select one;
- mark the event CONFLICTING until resolution criteria are met.

## Provenance
Every accepted event must preserve source ID, retrieval time, original URL/channel/message reference, content hash where applicable, and verification path.
