# Unified private source fan-in: operator country and corridor overlay

The production 90-minute `Three-Domain Unified Private Source Intake` had
collected the canonical official/free/discovery-root, Telegram pointer and
historical source registries, but did not read the newly registered operator
source overlays. This meant adding those overlays never updated the common
private source control-plane inventory.

This patch includes three already checked-in metadata sources:

- 76 operator-supplied named provider candidates
- 37 global + 71 national country provider source entries
- 20 corridor-specific source candidates; 58 named corridors tracked as
  **geography references**, not additional evidence publishers

All three domains receive the source references they are declared relevant to.
A corridor source can be relevant to multiple categories, but that doesn't
make it independent corroboration in each category. All source/provider IDs
are hashed into `source_ref` with their original lane, and provider URLs,
headlines, reported data, source names, credentials and route names do **not**
appear in uploaded queues or logs.

Existing-family aliases remain `EXISTING_FAMILY_REUSE_NO_NEW_POLLER`;
publisher-restricted, inaccessible, candidate, private monitoring and
credentials-required sources remain distinctly **non-commercial**.
There are no new requests to publisher endpoints, models, Telegram, B2,
Supabase, D1 or settlement from this fan-in. Checked-in overlay source refs
can never change a risk event's rights or signed status.

Strict schema and length checks catch incomplete or drifting operator
registries. Edited catalogues that claim `commercial_eligible: true`,
verified owner rights or a paid/scored named corridor instead of a
`NOT_MODELED` geography hard-fail the inventory. A queue with 58 named
corridor entries falsely represented as data publishers must not be issued.

This solves the **missing inventory connection only**, not the independent
article identity, original timestamps, same-event evidence, dataset-specific
licensing, risk scoring or GRO signatures. The genuine commercial path remains
fail-closed until all such requirements are verified.

See [master production blocker #1827](https://github.com/blocknine0/geomacro/issues/1827).
