# Global Realtime Acceptance Checkpoint

The verified stable portion of PR #835 and its final recovery fixes are now on canonical `main`.

This checkpoint records the repository state only. Production activation, mainnet activation, and any real-money settlement remain disabled until the applicable production acceptance gates pass.

## Final fixes landed

- critical realtime orchestrator task allowlist restored
- bounded orchestrator retry sleep added
- scoped GitHub Actions OIDC refresh added to the RSS worker after ingest HTTP 401
- Ask Geomacro build syntax corrected
- Ask Geomacro user-facing evidence is structured and does not expose raw source URLs or provider payloads
- approved website lock baseline aligned with the founder-approved mainnet-coming-soon presentation

## Acceptance boundary

The repository remains fail-closed for production funds and Arc mainnet transaction features until full production completion and acceptance.
