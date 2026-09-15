# P0 Release and Incident Operations Runbook

Status: **release-control runbook**  
Scope: Risk Intelligence, signed Risk Objects, Risk Gate and governed APIs. Prediction markets are excluded from production release and remain permanently Arc Testnet-only.

This runbook defines the operational actions required around a production/Early Access release. It does not claim a 24/7 SLA, certification, independent audit or production readiness by itself.

## Roles and authority

Geomacro is currently founder-led. Until a staffed operations function exists:

- **Release owner:** founder/operator approving the reviewed commit and release evidence.
- **Incident owner:** founder/operator coordinating containment, evidence preservation, credential/key revocation and rollback.
- **Customer execution owner:** the customer/application. Geomacro never owns the customer's transaction authorization, funds or policy.
- **External security reviewer:** an independent qualified reviewer. This role cannot be self-attested by Geomacro.

No role may override the permanent `execution_authorized=false` boundary.

## Hard release blockers

Do not promote Risk Objects, Risk Gate or governed APIs beyond their evidenced release stage when any applicable condition below is true:

1. a source used in paid structured delivery is not commercially verified;
2. an applicable credential cannot be rotated/revoked or its scope is broader than required;
3. Risk Object verification accepts a tampered, expired, unsupported or revoked-key object;
4. Risk Gate can return or imply transaction authorization;
5. the real authenticated HTTP path has no retained capacity/resilience evidence for the intended load envelope;
6. a dependency outage can silently convert uncertainty into a successful low-risk result;
7. privileged service-role/signing/provider material is exposed to public/browser surfaces;
8. a critical/high security finding remains open for the affected release surface;
9. independent external review is required for the intended claim but has not occurred;
10. current deployment source cannot be tied to a reviewed commit.

## Pre-release evidence checklist

For the exact candidate commit retain:

- Product CI/build and database-safety results;
- CodeQL/security workflow results;
- P0 security/resilience evidence artifact;
- source-rights/commercial-delivery evidence for paid capabilities;
- credential lifecycle evidence for the enabled API/client type;
- Risk Object signing/readiness evidence;
- authenticated staging HTTP load artifact for the intended load envelope;
- current health/readiness output;
- deployment/commit identifier;
- known limitations and customer responsibilities.

A missing item remains missing. Do not replace it with a roadmap statement or a different test.

## Deployment procedure

1. Freeze the candidate commit SHA and confirm it is reachable from canonical `main`.
2. Verify all applicable hard blockers above are clear.
3. Verify the target database/project/environment identity before any privileged operation.
4. Apply only reviewed migrations for that release. Never use a reset/repair shortcut in production.
5. Deploy the exact reviewed source.
6. Verify `/api/risk-gate-readiness` and the relevant public trust/readiness endpoints.
7. Run a bounded authenticated smoke request with a unique request ID.
8. Verify the response remains non-authorizing and immutable audit evidence exists.
9. Verify replay/idempotency behavior for the smoke request where applicable.
10. Record the release commit, deployment time, smoke evidence and known limitations.

## Rollback / disable procedure

When a material regression is detected:

1. stop new access to the affected capability when safe to do so;
2. preserve the failing request/audit/deployment evidence before changing state;
3. disable or revoke affected API credentials when credential misuse is plausible;
4. revoke the affected signing key in the trusted public registry when signing-key compromise is plausible;
5. roll back to the last reviewed application commit only when its database/schema contract is still compatible;
6. otherwise disable the affected capability rather than forcing an incompatible code rollback;
7. re-run readiness, fail-closed and smoke checks after rollback/disable;
8. document the incident and the evidence used to restore service.

Do not delete historical verification keys merely because a normal rotation occurred. Retired keys preserve valid historical signatures; compromised keys are explicitly `revoked` so verification fails closed.

## Dependency outage policy

The safe default is reduced autonomy rather than fabricated certainty.

- **Authentication backend unavailable:** reject the authenticated action path; do not evaluate and deliver a successful decision.
- **Rate-limit backend unavailable:** fail closed for the external action path; do not bypass rate controls.
- **Audit/idempotency persistence unavailable:** do not deliver a successful decision that cannot be durably evidenced.
- **Risk Object/read path unavailable:** do not substitute a synthetic low-risk object.
- **Stale/expired/unverifiable input:** follow the Risk Gate freshness/verification contract and require review/pause as defined; never silently convert it to fresh verified data.
- **Recovery:** a later healthy request must be evaluated from current trusted state. A failed result must not be cached/replayed as a successful decision.

The repository's dependency-recovery tests prove these code paths in isolation. A real staging outage/recovery exercise remains separate operational evidence.

## Credential / signing incident response

For suspected credential exposure:

1. identify the exact credential/key and its trust domain;
2. disable/revoke that credential without rotating unrelated secrets blindly;
3. preserve issuance/use/audit evidence;
4. issue replacement material through the governed lifecycle;
5. verify least-privilege scope and last-used/audit visibility;
6. re-test the affected endpoint before restoring access.

For Risk Object signing-key compromise, mark the compromised key `revoked` in the verification registry. Normal rotation uses `retired`, not `revoked`.

## Evidence retention

Retain machine-readable evidence for material release gates and incidents long enough to support customer diligence and post-incident analysis. The P0 security/resilience workflow currently retains its sanitized artifacts for 90 days. Production/customer evidence retention may be extended separately when contractual requirements exist.

Never persist private keys, service-role keys, raw payment signatures or customer secrets in evidence artifacts.

## Claims after release testing

Allowed claims must describe the evidence actually retained. For example:

> Geomacro has documented internal fail-closed, key-lifecycle, secret-boundary and resilience testing for the Private Pilot Risk Gate boundary.

Do not claim independent audit, certification, penetration testing, SLA-backed availability, predictive accuracy or institutional-grade validation unless separately evidenced by the relevant qualified process.
