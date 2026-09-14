# India Enterprise Vendor Readiness Matrix

Status: internal commercial-readiness control. Last reviewed: 2026-09-14.

Purpose: prepare Geomacro for diligence by Indian enterprises, including RBI-, SEBI- and IRDAI-regulated buyers. This is an engineering and commercial readiness matrix, not legal advice and not a claim that Geomacro itself is regulated or certified by these authorities.

## Regulatory context used for this matrix

### India data protection

The Digital Personal Data Protection Rules, 2025 were notified by MeitY on 14 November 2025 with a phased implementation timeline.

Official reference:
`https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025`

Commercial implication: if a customer workflow causes Geomacro to process digital personal data, the exact roles, purposes, notices, contractual instructions, security safeguards, retention/deletion and breach handling must be mapped before production use.

### CERT-In directions

CERT-In directions dated 28 April 2022 require relevant service providers, intermediaries, data centres, body corporates and government organisations to enable ICT logs and retain them securely for a rolling 180-day period within Indian jurisdiction, together with other incident-response obligations.

Official reference:
`https://www.cert-in.org.in/Directions70B.jsp`

Commercial implication: Geomacro needs an India-specific logging and incident-response design before representing a regulated-enterprise deployment as fully procurement-ready. Logging must not silently conflict with privacy, minimisation or secret-handling controls.

### RBI IT outsourcing

Reserve Bank of India (Outsourcing of Information Technology Services) Directions, 2023 apply to covered RBI-regulated entities and impose service-provider due-diligence and contracting expectations for material IT outsourcing.

Official reference:
`https://www.rbi.org.in/`
Master Direction date: 10 April 2023.

Relevant buyer diligence areas include service-provider capability, security/internal controls, confidentiality, audit access, subcontractors, business continuity/disaster recovery, incident reporting, data access, cross-border outsourcing and exit/data destruction.

### RBI IT governance

RBI issued the Master Direction on Information Technology Governance, Risk, Controls and Assurance Practices on 7 November 2023.

Commercial implication: a regulated buyer can require evidence that a third-party technology dependency fits its own governance, control, resilience and assurance obligations.

### SEBI cybersecurity framework

SEBI issued the Cybersecurity and Cyber Resilience Framework (CSCRF) for SEBI Regulated Entities on 20 August 2024, followed by implementation clarifications/extensions in 2025.

Official reference:
`https://www.sebi.gov.in/legal/circulars/aug-2024/cybersecurity-and-cyber-resilience-framework-cscrf-for-sebi-regulated-entities-res-_85964.html`

Commercial implication: brokers, asset managers and other SEBI-regulated prospects may require stronger vendor-security evidence and resilience controls than an ordinary enterprise pilot.

### IRDAI cyber-security framework

IRDAI published Information and Cyber Security Guidelines, 2023 for its regulated ecosystem.

Official reference:
`https://irdai.gov.in/document-detail?documentId=3314780`

Commercial implication: insurer/intermediary buyers may require formal information-security diligence, evidence and audit support.

## Readiness scale

- `READY`: implemented today and can be evidenced.
- `PARTIAL`: some controls exist but customer-grade process/evidence is incomplete.
- `GAP`: should not be promised until implemented.
- `SCOPE_DEPENDENT`: applicability depends on the exact customer service/data flow.

## Control matrix

| Area | Status | Current Geomacro position | Required before larger regulated deployment |
|---|---|---|---|
| Product scope | READY | Risk Intelligence, governed Data/API, signed Risk Objects and Risk Gate are clearly separated from Technical Proof | Keep proposal-specific capability list and exclusions |
| Transaction authority | READY | Risk Gate preserves `execution_authorized=false`; customer controls action | Keep contract/API wording aligned |
| Source rights | READY | Paid delivery fails closed on UNVERIFIED/REVIEW_REQUIRED/INELIGIBLE evidence | Maintain source-rights review and delivery restrictions |
| Risk Object integrity | READY | Ed25519 signatures, payload hashes, key IDs and lifecycle verification | Preserve key-rotation/revocation evidence |
| Public verification | READY | Public verification-key endpoint exists | Maintain availability and key history |
| Privileged-secret boundary | READY | Signing/service-role material is server-only by design | Continue build/CI checks and secret rotation |
| Static security scanning | READY | CodeQL and scoped security tests are in repository workflows | Maintain current results and remediation records |
| Fail-closed behavior | READY | Data/verification/source-rights uncertainty is designed to block commercial use | Preserve regression coverage |
| Production/staging separation | READY/PARTIAL | Security baseline defines separation and prohibits production stress testing | Maintain isolated staging and deployment evidence |
| Browser/security headers | PARTIAL | Multiple headers implemented; full CSP source allow-list remains a known gap | Complete report-only observation and enforce tested CSP |
| Rate limiting | PARTIAL | Application/process-local controls exist | Add shared/distributed edge rate limiting for high-volume enterprise use |
| Enterprise authentication | PARTIAL | Bounded credentials/wallet developer access exists | Add customer-grade identity/RBAC/SSO where required |
| Tenant isolation | PARTIAL | Commercial entitlements are bounded by capability and subject | Document and test stronger enterprise tenant isolation before multi-tenant regulated scale |
| Audit trail/replay | PARTIAL/READY BY SURFACE | Risk Gate/audit evidence exists on supported workflows | Produce customer-facing retention/query procedure and scope |
| Personal-data inventory | GAP | No complete India-specific customer-data inventory is currently published | Create data map, purposes, fields, retention, locations and lawful-role analysis |
| Privacy notice | GAP | No India enterprise privacy pack is currently established | Publish/contract the applicable notice before personal-data production workflows |
| DPA | GAP | No standard India DPA is currently established | Obtain counsel-reviewed DPA/process before acting as processor/data processor equivalent for customer personal data |
| Subprocessor register | GAP | No customer-facing register is currently maintained | List hosting, database, model/API and operational subprocessors with location/purpose |
| Data-location register | GAP | Infrastructure locations are not yet packaged for diligence | Document storage, processing, backup and logging locations |
| CERT-In log design | GAP/PARTIAL | General security logging exists but India 180-day/location control is not yet evidenced as a complete operating system | Implement India-compliant log-retention/location architecture where applicable |
| Incident response | PARTIAL | Security baseline includes incident-response steps | Add customer notice/escalation contacts, severity matrix, regulator/customer timing obligations and evidence |
| BCP/DR | PARTIAL | Recovery/source-of-truth principles documented | Define tested service-specific BCP/DR, recovery evidence and contractual RTO/RPO only after testing |
| SLA/SLO | GAP for enterprise GA | No general enterprise SLA is claimed | Build measured service history before contractual availability/response commitments |
| Vulnerability management | PARTIAL | CI/security checks exist | Add recurring external assessment/VAPT as buyer tier requires; preserve remediation evidence |
| External certification | GAP | No SOC 2 / ISO 27001 claim | Obtain only when strategically justified; never imply before completion |
| CERT-In empanelled audit | GAP | Not currently claimed | Commission where customer/procurement or risk tier requires it |
| Regulator/auditor access clauses | GAP contractually | Technical evidence can be supplied, but no standard regulated-buyer contract pack exists | Add counsel-reviewed audit/access clauses appropriate to service scope |
| Subcontractor approval/change | GAP contractually | No standard enterprise notification process is established | Add subprocessor/subcontractor change process |
| Exit/data deletion | PARTIAL | Technical boundary avoids raw default delivery | Create documented customer export/return/deletion/verification process and contract clauses |
| Legal entity/procurement pack | GAP/PARTIAL | Product evidence exists; contracting/invoice/tax pack must match final entity | Finalize legal entity, tax, bank, signing authority and procurement documents |
| Insurance coverage | GAP/UNKNOWN | No customer-facing policy is claimed | Evaluate cyber/professional indemnity requirements by buyer tier |

## India regulated-buyer minimum pack

Before approaching a large RBI-, SEBI- or IRDAI-regulated institution as a production vendor, prepare at minimum:

1. legal entity and signing-authority details;
2. product/service description and architecture diagram;
3. customer data-flow and data classification;
4. hosting/subprocessor/data-location register;
5. security baseline and latest security evidence;
6. vulnerability/patch management process;
7. access-control and secret-management description;
8. incident-response plan and named escalation contacts;
9. BCP/DR plan plus latest test evidence;
10. proposed SLA/SLO backed by measured evidence;
11. DPA/privacy schedule where personal data is involved;
12. MSA/SOW/security schedule;
13. audit and regulator-access clauses where required;
14. subcontractor/subprocessor change clauses;
15. exit, transition, data return and deletion procedure;
16. source-rights/provenance policy for delivered intelligence;
17. limitations and customer-responsibility schedule;
18. current open-risk/gap register.

## Pilot-first procurement strategy

Until all enterprise gaps above are closed, sell a narrow controlled pilot that intentionally reduces vendor risk:

- no customer production transaction authority;
- no custody;
- avoid personal/customer data unless necessary;
- use country/corridor identifiers and operational policy inputs rather than customer PII where possible;
- bounded API entitlement;
- bounded countries/workflow;
- founder-led support;
- explicit Private Pilot label;
- no general SLA;
- written success/stop criteria;
- customer-controlled execution;
- source-rights fail-closed output.

This structure makes the first Indian B2B sale more realistic while preserving the path to regulated-enterprise maturity.

## Claims policy

Allowed:

- "We can provide our implemented security controls and test evidence for diligence."
- "Risk Objects are signed and independently verifiable using the published key material."
- "Commercial source eligibility is enforced and unresolved rights fail closed."
- "Risk Gate provides decision context; the customer retains execution control."

Not allowed without additional evidence:

- "RBI compliant";
- "SEBI compliant";
- "IRDAI compliant";
- "DPDP certified";
- "CERT-In certified";
- "bank-grade" as an unqualified claim;
- "SOC 2 compliant/certified";
- "ISO 27001 certified";
- "production SLA" when none is contracted and evidenced.

## Review trigger

Re-review this matrix whenever any of the following changes:

- India privacy/cybersecurity rules or enforcement timeline;
- buyer regulator or outsourcing classification;
- customer-data fields;
- infrastructure/subprocessor/location;
- authentication/tenant model;
- source/data provider;
- enterprise SLA commitment;
- security audit/certification status;
- contracting entity.
