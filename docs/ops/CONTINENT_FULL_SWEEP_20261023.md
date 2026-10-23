# All countries of each continent, every two hours

Owner clarification replaces the earlier one-country-per-tick rotation. Each
scheduled run now includes EVERY canonical country in its continent, for only
Geopolitics, Macro / FX, and Critical Minerals.

| Continent | Countries | Category checks per run | Planned UTC starts |
| --- | ---: | ---: | --- |
| Africa | 54 | 162 | 00:04, 02:04, …, 22:04 |
| Asia | 47 | 141 | 00:24, 02:24, …, 22:24 |
| Europe | 45 | 135 | 00:44, 02:44, …, 22:44 |
| North America | 23 | 69 | 01:04, 03:04, …, 23:04 |
| South America | 12 | 36 | 01:24, 03:24, …, 23:24 |
| Oceania | 14 | 42 | 01:44, 03:44, …, 23:44 |

That is 195 distinct countries / 585 category checks in each planned two-hour
cycle. Each continent repeats its WHOLE country list on the next tick; no
clock-based or saved-country cursor reduces the scheduled scope. GitHub cron
is best effort: planned starts are 20 minutes apart, actual starts can be late.

One Actions job per continent reuses the existing exact-country verifier with
two bounded in-run workers. There is no 195-job matrix. Each country retains
its shared 12-discovery / 4-original-page cap for all three categories combined.
The upper bound per complete global cycle is 2,340 discovery requests and 780
original-page requests, distributed over the six lanes; these are limits, not
promises of source availability. Per-country execution is capped at two minutes;
the continent job timeout is 70 minutes, below its two-hour recurrence.

A failed or timed-out country is recorded and does not cancel the remaining
countries. The job fails if any country has no valid checkpoint. Source denial,
rate limiting, or no qualifying evidence remains explicitly unverified in the
existing three-category evidence model. An HTTP success alone never certifies
original news, commercial rights, scores, or signed products.

The continent artifact includes the entire country's three-category reports,
completion counts and failures. Artifacts remain isolated by continent/run/attempt.
The daily rollup reads the latest successful scheduled run of each continent,
validates every member and three-category receipt, and accepts legacy artifacts
during migration. It never fabricates 585 current verified original stories.

Post-merge bootstrap checks the full smallest continent (South America) plus one
country in each other lane to validate runtime integration without duplicating
all six full sweeps immediately. Scheduled runs cannot opt into this smoke mode
or a manual country pin. Explicit manual ISO3 checks remain available.

The existing three-category website news publisher remains separate: source
probe diagnostics are not automatically promoted to publishable findings.
