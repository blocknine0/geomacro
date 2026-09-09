# Security Operations Baseline

Status: commercial launch-readiness baseline. This document describes implemented controls, required operating practices and known residual risks. It is not a certification or third-party audit report.

## Security objectives

Geomacro security work is organized around five objectives:

1. protect privileged credentials and customer trust boundaries;
2. fail closed when chain, database, source-rights or verification state is uncertain;
3. preserve integrity and provenance for intelligence and signed Risk Objects;
4. limit blast radius when a public endpoint, dependency or automation is abused;
5. retain enough evidence and recovery capability to diagnose and remediate material incidents.

No software system can be guaranteed unhackable. Launch decisions are therefore evidence-based and critical/high findings block the affected launch surface until fixed and re-tested.

## Trust boundaries

### Public browser

The browser receives only public configuration. Service-role credentials, signing private keys and privileged wallet keys must never be exposed through `VITE_*` variables or browser bundles.

Public Supabase reads are routed through the same-origin read-only proxy so hosting-injected browser credentials are not treated as an authority boundary.

### Server/API

Server routes validate request shape and size, sanitize public errors and apply fail-closed product boundaries. The public Agent path is read-only. Risk Gate responses keep `execution_authorized=false`.

### Database

Production privileged workflows verify the authoritative Supabase project ref `ldpwajisioljyjtojvfx` before service-role writes. Production reset/repair/seed/load-test operations are prohibited in normal release and staging procedures.

### Signed Risk Objects

Risk Objects use Ed25519 signatures, stable key IDs and lifecycle/readiness checks. Signing material is server-only. Verification status and commercial eligibility are explicit rather than inferred from missing evidence.

### Arc/onchain technical proof

The Arc environment is testnet technical proof. State-changing workflows verify chain ID `5042002` and deployed contract bytecode before privileged signing credentials are exposed to the transaction step.

Rare admin upgrade/funding signing is prohibited in hosted CI. See `docs/ONCHAIN_ADMIN_SIGNING_RUNBOOK.md`.

## GitHub Actions controls

Privileged workflows should follow these rules:

- explicit least-privilege `permissions`;
- third-party actions pinned to immutable commit SHAs;
- checkout credentials not persisted when push access is unnecessary;
- lockfile-based installs;
- dependency lifecycle scripts disabled where workflow functionality does not require them;
- main-branch guard for state-changing or production-data operations;
- explicit timeout;
- concurrency groups based on the signing credential/trust domain;
- no cancellation of a runner that can be in the middle of signing/broadcasting;
- chain and production-database preflight before privileged credentials are used.

## Public API abuse controls

Public Agent/Risk Gate requests have bounded request bodies, schema validation, sanitized failures and process-local throttling with a namespace-global fail-safe.

Known limitation: the current application-layer limiter is process-local rather than a distributed edge limiter. Broader/high-volume commercial launch requires a shared edge/rate-limit control appropriate to the hosting topology.

## Browser security controls

Current response controls include:

- enforced `base-uri 'self'`;
- `object-src 'none'`;
- `frame-ancestors 'none'`;
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- strict-origin referrer policy;
- camera/microphone/geolocation disabled through Permissions Policy;
- one-year HSTS on HTTPS.

Known limitation: a full source allow-list CSP is not yet enforced because wallet, Circle and RPC integrations must first be observed under a report-only policy to avoid breaking legitimate flows. Tighten this only after production integration evidence is captured.

## Supply-chain controls

- application installs are lockfile-driven;
- critical hosted workflows use immutable action SHAs;
- CodeQL/static security scanning should run on current code;
- GitHub Actions dependencies are monitored for updates;
- suspicious dependency advisories are triaged before launch claims are made.

A successful scanner result is not equivalent to a penetration test or certification.

## Environments

### Production

- authoritative Supabase ref: `ldpwajisioljyjtojvfx`;
- no destructive migration reset/repair flow;
- no stress/load test against `geomacro.live`;
- public claims must match verified production behavior.

### Staging

- dedicated isolated Supabase project;
- no production data copying as a shortcut;
- no production signing keys;
- resilience testing allowed only against explicit staging hosts with the staging acknowledgement gate.

## Release security gate

Before an externally shareable demo/Early Access release:

1. exact source/version is identified;
2. CI/tests/build are green;
3. database migration safety is green for relevant changes;
4. security-header and signing lifecycle contracts are green;
5. staging runtime smoke tests pass;
6. relevant abuse/resilience test passes without boundary violations;
7. critical/high findings are fixed and re-tested;
8. known limitations are written down;
9. production deployment is proven to match the reviewed source;
10. no unsupported audit/certification claims are used publicly.

## Incident response

For a suspected material incident:

1. stop or isolate the affected capability where safe;
2. preserve logs, commit/deployment identifiers and public transaction evidence;
3. rotate/revoke affected credentials where exposure is plausible;
4. verify production database, chain and signing boundaries before restoration;
5. fix the root cause in source control;
6. test the remediation in isolation;
7. deploy from an identified reviewed commit;
8. perform post-deploy smoke/monitoring checks;
9. document residual risk and follow-up work.

Do not destroy evidence or rotate unrelated credentials blindly before establishing the affected trust boundary.

## Backup and recovery

Operational recovery must preserve source-of-truth separation:

- GitHub `main` is the application source authority;
- hosting/Lovable must be reconciled to reviewed GitHub source before publish;
- production database migrations are versioned and replay-tested on disposable infrastructure;
- key lifecycle metadata and public verification keys are versioned separately from private key material;
- recovery actions must not silently replace unavailable evidence with synthetic/fallback risk values.

## Commercial diligence statement

Geomacro can present implemented controls and test evidence to a prospective pilot customer. It must not describe these controls as SOC 2, ISO 27001, penetration-tested, formally audited or certified unless those milestones are actually completed by the relevant qualified party.
