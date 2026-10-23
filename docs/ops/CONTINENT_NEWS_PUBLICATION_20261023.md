# Same-run three-category website news

The full-continent workflows now publish eligible Geopolitics, Macro / FX and
Critical Minerals findings into the EXISTING 72-hour website D1 journal. This
replaces the source-only limitation in CONTINENT_FULL_SWEEP_20261023.md.

For each country, reuse the existing canonical discovery and four-page original
verifier. Only country-bound, registry-approved first-party article URLs with a
verified exact native publication clock and a matched private discovery record
reach the existing actor/action website deriver. Feed leads, discovery indexes,
annual WDI figures, missing originals and unclassified candidates cannot become
new website news through this bridge. No extra upstream reads are needed for
this country-derived continuation.

The source worker writes ONLY derived signals to its private RUNNER_TEMP spool.
It receives no publisher token. The parent runner derives the existing protected
D1 authorization, deduplicates against all retained journal pages, and publishes
eligible findings after each country rather than waiting for the whole continent.
Repeated originals retain stable existing source/story IDs across countries and
intake paths. Existing publication clocks are never overwritten.

Exact originals younger than 15 minutes remain private in runner memory. The
same job waits only until their true original clock +15 minutes before publishing,
so they do not need to wait for another two-hour country scan. All private spools
are removed; only safe counts and source-proof diagnostics enter artifacts.
The D1 PUT acknowledgement AND independent complete journal GET must match before
publication is counted as verified. Missing auth/readback makes the job visibly
fail while country probes continue. No raw titles, URLs, bodies or publisher IDs
are put in public D1 or the artifact.

Each continent job additionally invokes the EXISTING original-news fastlane for
all three categories in the same run, with its existing bounded approved sources
and 15-minute gate. The separate five-minute fastlane continues between continent
runs. The production environment supplies the existing ledger secret; no new key,
paid source, database, table, Worker deployment or website UI change is required.

The continent job timeout is 95 minutes, below its two-hour recurrence and allowing
for bounded source calls, publication readback, and the maximum 15-minute release
hold. Cron starts remain 20 minutes apart on the existing schedule, best effort.
The website's existing journal refresh picks up the published rows automatically.

This does NOT guarantee every world event within 20 minutes: a given country is
scanned every two hours, sources can be quiet/unavailable, and GitHub can delay
cron. It does make eligible evidence found in THAT run publish in THAT run, with
truthful original dates and explicit three-category counts. Day-only originals
remain on their existing conservative publisher path; no exact clock is invented.
No scoring, commercial rights, independent review or signed GRO is claimed.
