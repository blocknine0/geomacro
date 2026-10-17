# GDACS first-party country identifier vs affected-country verification

The original GDACS transport probe validated that an official event-list API responds. This scoped read-only next step validates a native three-letter ISO-like country identifier alongside an event identifier, country label, event detection clock and optional WGS84 point coordinates from the official GDACS GeoJSON. It counts only recognized event objects, suppresses individual ids and third-party text from health receipts, and rejects uncertain data.

A source native country identifier is not evidence that *all affected countries* have been confirmed, not evidence of a government political decision, and not a verified original-source publication timestamp. The code continues to mark affected-country certification, geopolitics classification, rights and commercial paid eligibility as false.

The protected daily workflow requests only one bounded upstream page, maximum 512 KiB, no redirects, 12 sec timeout and no Supabase, B2, D1 or payments. Production must return a first-party native country in the actual provider response; otherwise the receipt is degraded and no false events are published. Tests: `node --test scripts/tests/gdacs-native-country.test.mjs`.
