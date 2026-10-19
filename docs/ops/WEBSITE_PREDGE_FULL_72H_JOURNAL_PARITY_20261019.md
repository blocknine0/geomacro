# Exact Geomacro Intelligence / Predge 72h parity

The canonical hourly producer writes original-dated Geomacro-authored derived
news into the existing Cloudflare D1 72-hour rolling journal (600 max).
Predge's source-neutral research feed already fetches the journal in
250-row pages (offsets 0,250,500). The website SSR and browser desk now use
the **same** strict paginated fetchAllDerivedNews() reader. The old one-page
call silently missed everything after the first 250 stories.

Source-neutral partner records remain a subset of the underlying journal:
rows requiring visible publisher credit remain on the website only.
Identical eligible IDs, dates and derived facts serve both destinations.
Day-only embargoes, source-clock validation, deduplication, no raw upstream,
no derived commercial rights implication and no-funds restrictions remain.

No new upstream reads, storage, wallets, Supabase or B2. Live website
activation still requires exact Lovable publish SHA; direct Cloudflare
Worker partner research feed does not.
