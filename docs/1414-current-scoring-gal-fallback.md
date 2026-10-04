# #1414 current scoring GAL fallback

The current-scoring fastlane remains a canonical-classifier path. GDELT DOC is attempted first. If DOC is temporarily unavailable/rate-limited, or returns no current candidates, the fastlane may use the already-governed GDELT GAL Article List as bounded discovery infrastructure.

Safety contract:

- GAL candidates retain original publisher URL/domain internally for provenance and source-cap logic.
- Candidate time comes from the source record when valid, otherwise from the real GAL file minute. Wall-clock `now` is never substituted as evidence time.
- GAL fields are not severity/confidence inputs by themselves. Every candidate still passes the existing `event-severity-v1.0.5` classifier and deterministic category/freshness/confidence/severity gates.
- Normal cadence remains one rotating domain per scheduled run. A push that changes the fastlane workflow performs a one-time serialized macro then rare-earth catch-up proof so deployment changes can be verified without waiting for two future cron slots.
- Guardian/GDACS/ReliefWeb remain disabled in this bounded lane.
