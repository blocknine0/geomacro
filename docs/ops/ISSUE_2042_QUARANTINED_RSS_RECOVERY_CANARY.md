# #2042 — Safe rescue of previously unreachable official mineral RSS transports

Legacy source probe [#38119569303](https://github.com/blocknine0/geomacro/actions/runs/38119569303)
found three quarantines. The EITI API gave HTTP 403; Geomacro must
respect provider access control and must NOT retry or bypass it.
The two other quarantines were network/transport failures, NOT access denial:
NRCan Simply Science and USGS Minerals RSS.

Both publisher sites retain the exact first-party RSS URLs in their own
source catalogues. The bounded canary uses only those two pinned URLs.
No offsite mirrors, redirect following, GET escalation, user-supplied URLs,
client questions, provider credentials or commercial permissions are involved.

`scripts/ops/observe-quarantined-official-rss-canary.mjs` performs at most
two HTTPS GETs and bounded 192KiB parsing, with a 6-second per-request
timeout. Only real HTTP 200 + XML MIME + actual RSS/Atom XML root with at
least one item is counted as **recovered RSS transport**. 401/403/429,
redirected content, HTML, empty feeds, wrong MIME, oversize and downtime
fail closed with only per-category private counters. Raw feed items,
source URLs and provider IDs are not serialized in the CI receipt.

The minimal GitHub workflow runs weekly (Monday 07:31 UTC), manually,
and once after code is merged. It uses no B2/D1/Supabase/model/x402.
Even a green transport sample does NOT prove a 24h published original,
a content/article page hash, 195-country minerals coverage, source
commercial-use permission, or signed GRO. The three preexisting quarantine
states remain UNCHANGED until sustained positive production source/date
proof is evaluated separately.

This is a verified *capability* and an executable real-world source
recovery check, not a claim that a publisher has stopped challenging the
Geomacro runtime. Keep #2042 and #2170 open until an actual successful
post-merge canary receipt demonstrates publisher transport recovery.
