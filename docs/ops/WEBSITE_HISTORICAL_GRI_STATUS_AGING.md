# Website historical GRI status aging

An immutable snapshot may correctly record domain readings as `current` when it
is written. After the six-hour current-reading window, the same native dates
require `last_verified` under the continuity contract. Validating the archived
display label unchanged at today's clock incorrectly rejects an otherwise valid
historical website snapshot.

`websiteHistoricalRiskView` projects only those expired display labels to
`last_verified`, then runs the complete existing continuity validator again.
It never upgrades a label, changes a score, original timestamp, history or proof
hash, mutates the archive, or relaxes the current paid-product contract. The
website's minimum 60-minute embargo and maximum 30-day retention still apply.
Invalid proof fields, missing series and unrelated continuity failures remain
rejected. The helper is used only by the delayed website reader, after the D1
receipt's historical verification/privacy flags are checked and before the
existing source-redacted website projection is returned.

Acceptance requires the published website to render the original snapshot date
as historical/last verified. Restoring D1 or merging this change alone is not
live website acceptance and does not qualify current signed Intelligence, GRI
or Risk Indices, clear deep health, or close master recovery #1827.
