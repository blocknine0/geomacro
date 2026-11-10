# Hot50 actual Standard/Complex production evidence failures

Original probe: https://github.com/blocknine0/geomacro/actions/runs/42879697786

Observed Basic 46/50 READY, Standard 0/50 READY (insufficient independently
qualified three-category corroboration), Complex 0/50 READY with 503.

This safe Worker code fix does not invent missing independent originals.
The Complex response no longer queries seven days of history for a subject
without a CURRENT verified GRO plus independently readback-acknowledged
private B2 archive. A missing prerequisite returns HTTP 200 with a signed,
nonchargeable SIGNED_GRO_OR_ARCHIVE_NOT_READY response and exact symbolic
missing-source state. A malformed, corrupt or unavailable history clears
ALL tentative history and remains nonchargeable, preserving HMAC proof.
No generic evaluation/audit 503 is suppressed; only OPTIONAL historical
product retrieval is nonfatal. The real 7 daily signed-score history and
B2 archive acknowledgement remain mandatory for any Complex READY.

Standard still requires actual independent same-event original facts and
rights verification, or a pinned verified three-category Ed25519 GRO.
More RSS registrations do not satisfy those conditions automatically.
No fake events, paid billing, quota overrides, rollback holds or Predge
commercial traffic are authorized by this change.
