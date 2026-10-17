# Website Find Card and shared journal runtime recovery

Actual browser inspection on 2026-10-17 found `/api/v1/finds` returning
`FIND_CARD_SOURCE_JOURNAL_UNAVAILABLE` while the legacy canonical signed Finds
proxy and the browser-rendered Intelligence timeline were readable. The new
Find Card server path called a shared browser reader that still passed
`redirect:error` directly to workerd. The earlier security/Finds runtime fix
had not exercised this additional public reader.

Use the same manual-mode/no-redirect helper for the browser/server shared
reader. Reject redirects without following Location or retrying. Add the real
public Find Card feed handler to the pinned workerd integration: an eligible
fixture yields HTTP 200 and one valid v1 card, with exactly one additional
in-memory outbound read. No real API, B2, Supabase, credentials or funds.

The website server function also duplicated a stale filter that excluded
embargo-eligible Macro publisher-day records accepted by the D1 journal and
browser. A separately testable server reader now reuses checkedDerivedNews,
including the same next-day 12:15 UTC day-only embargo. Original precision and
clocks remain untouched. Unknown fields and nested private metadata, malformed
native dates, invalid geography/type and oversized signal text fail closed.
Existing mandatory credits are preserved; they are never erased to make a
record eligible for the separate source-private v1 Find Card schema.

After publication, verify the actual `/api/v1/finds` route, category filtering,
Macro day-only server/browser parity, source-private card fields and the
unchanged strict commercial/paid gates. A passing local runtime fixture is
not proof that the website has published this revision. This change does not
recover missing current scored Intelligence, GRI or Risk Indices or close the
full launch tracker.
