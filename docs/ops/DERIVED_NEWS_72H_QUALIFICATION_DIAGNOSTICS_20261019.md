# 72-hour news: permanent source-health diagnosis without fabricated releases

19 October 2026 live receipt: 11/12 geopolitical source feeds with 66 candidates yielded
8 D1 derived stories; 17/21 macro with 21 candidates yielded 0; 13/16 minerals
with 10 candidates yielded 0. Some credited stories are withheld from Geomacro
source-neutral output because legally required source attribution cannot be hidden.

Auto Ingest News uses the existing authenticated D1 control plane to write one
bounded, source-neutral `pipeline_checkpoint` per category **AFTER** successfully
publishing/sweeping its 72h D1 journal. Only counts and an actual runner check
timestamp are saved. No original title, URL, raw bytes, attribution strings,
payment or scoring; no new D1 table. A current verified publisher checkpoint
is a collection event, never an original publisher news event.

Both the Geomacro Intelligence and Predge pilot remain bound to the same D1
journal and source-neutral `/v1/public/derived-structural-72h` projection.
New `latest_source_check`, held-by-credit counts and
`no_qualified_release_explanation` reveal the reason for a 0-release category.
No longer misinterpret a working collector as an unobserved one. The existing
`/v1/public/three-domain-continuity` provides independently dated historical
structured context when the 72-hour official release window is empty.

The `status: NO_QUALIFIED_RELEASE_IN_72H` remains truthful if no legally
displayable original release exists in the locked 72h window. This fix does
not convert old statistics into new news, unlock attribution-hidden sources,
authorize Predge commercial resale, promote signed GRI/GRO, or modify x402.
