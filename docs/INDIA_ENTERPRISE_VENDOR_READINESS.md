# India Enterprise Vendor Readiness Matrix

Status: internal commercial-readiness control. Last reviewed: 2026-09-14.

Purpose: prepare Geomacro for Indian B2B diligence without forcing every buyer through bank-grade procurement. The first-revenue strategy is media, research, SMEs, mid-market companies and technology buyers. RBI-, SEBI- and IRDAI-regulated production buyers remain a later, higher-assurance tier.

This is an engineering and commercial readiness matrix, not legal advice and not a claim that Geomacro itself is regulated, approved or certified by any authority.

## Buyer-risk tiers

### Tier A: low-data controlled pilot

Typical buyers:

- business/financial media;
- research publishers;
- boutique intelligence/advisory firms;
- exporters/importers;
- manufacturing, logistics, commodity and supply-chain SMEs;
- strategy teams using only Geomacro data and non-sensitive configuration.

Preferred architecture:

- no customer personal data unless necessary;
- no customer transaction authority;
- named user or bounded API credential;
- agreed countries/themes;
- Geomacro-derived intelligence only;
- source-rights fail closed;
- no general SLA;
- explicit pilot start/end and success criteria.

Minimum diligence pack:

1. service description and limitations;
2. pricing/SOW/order summary;
3. security baseline;
4. source-rights/provenance statement;
5. incident contact;
6. data-handling statement;
7. deletion/termination procedure for customer-supplied data, if any.

### Tier B: technical integration / mid-market enterprise

Typical buyers:

- fintech/treasury software;
- enterprise-AI platforms;
- larger exporters/importers;
- institutional research teams;
- financial-data companies;
- companies embedding API/Risk Gate into an internal workflow.

Add to Tier A:

- architecture/data-flow diagram;
- API authentication/entitlement description;
- tenant/client isolation evidence appropriate to scope;
- subprocessor/data-location register;
- vulnerability/security evidence;
- retention/logging statement;
- integration runbook;
- measured availability/latency evidence where offered;
- change and incident escalation process.

### Tier C: regulated / material production dependency

Typical buyers:

- banks and NBFCs;
- payments banks;
- regulated capital-markets firms;
- insurers/intermediaries;
- any buyer treating Geomacro as a material outsourced IT dependency.

Tier C may require substantially deeper legal, security, resilience, audit and exit commitments. Do not use a Tier A/B pilot as evidence that these requirements are complete.

## Regulatory context used for the higher-assurance tiers

### India data protection

The Digital Personal Data Protection Rules, 2025 were notified by MeitY on 14 November 2025 with phased commencement provisions. Rules 1, 2 and 17 to 21 commenced on Gazette publication; Rule 4 commences one year after publication; Rules 3, 5 to 16, 22 and 23 commence eighteen months after publication.

Official reference:
`https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025`

Commercial implication: where a customer workflow involves digital personal data, Geomacro must map the actual roles, purposes, fields, notices/instructions, safeguards, retention/deletion, locations and breach handling applicable at the time the service is deployed.

### CERT-In directions

CERT-In directions dated 28 April 2022 require covered service providers, intermediaries, data centres, body corporates and government organisations to enable ICT logs and retain them securely for a rolling 180-day period within Indian jurisdiction, together with incident-response/reporting obligations as applicable.

Official reference:
`https://www.cert-in.org.in/Directions70B.jsp`

Commercial implication: the production operating model must map applicable logging, time synchronization, incident reporting, point-of-contact and evidence-retention obligations. Logging must not conflict silently with minimisation, secret-handling or contractual privacy controls.

### RBI IT outsourcing

Reserve Bank of India (Outsourcing of Information Technology Services) Directions, 2023 were issued on 10 April 2023 and came into effect from 1 October 2023 for covered regulated entities.

Official reference:
`https://www.rbi.org.in/`

The regulated buyer can impose service-provider due-diligence and contracting requirements covering capability, confidentiality/security, audit/access, subcontracting, business continuity/disaster recovery, incident handling, cross-border arrangements and exit strategy.

### RBI IT governance

RBI issued the Master Direction on Information Technology Governance, Risk, Controls and Assurance Practices on 7 November 2023.

Commercial implication: a regulated buyer may need to show that a third-party dependency fits its own governance, control, resilience and assurance obligations.

### SEBI cybersecurity framework

SEBI issued the Cybersecurity and Cyber Resilience Framework (CSCRF) for SEBI Regulated Entities on 20 August 2024, with subsequent FAQs/technical clarifications.

Official reference:
`https://www.sebi.gov.in/legal/circulars/aug-2024/cybersecurity-and-cyber-resilience-framework-cscrf-for-sebi-regulated-entities-res-_85964.html`

Commercial implication: SEBI-regulated buyers may require a significantly stronger vendor-security/resilience evidence pack than a media or SME pilot.

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

| Area | Status | Current Geomacro position | Required before broader/higher-risk deployment |
|---|---|---|---|
| Product scope | READY | Risk Intelligence, governed Data/API, signed Risk Objects and Risk Gate are separated from Technical Proof | Keep proposal-specific capability list and exclusions |
| Transaction authority | READY | Risk Gate preserves `execution_authorized=false`; customer controls action | Keep contract/API wording aligned |
| Source rights | READY | Paid delivery fails closed on UNVERIFIED/REVIEW_REQUIRED/INELIGIBLE evidence | Maintain source-rights review and delivery restrictions |
| Country coverage truth | PARTIAL/READY BY SUBJECT | Global registry exists; a subject is not called supported until current module/acceptance evidence passes | Generate automated global country readiness census and retain run evidence |
| Risk Object integrity | READY | Ed25519 signatures, payload hashes, key IDs and lifecycle verification | Preserve key-rotation/revocation evidence |
| Public verification | READY | Public verification-key endpoint exists | Maintain availability and key history |
| Privileged-secret boundary | READY | Signing/service-role material is server-only by design | Continue build/CI checks and secret rotation |
| Static security scanning | READY | CodeQL and scoped security tests are in repository workflows | Maintain current results and remediation records |
| Fail-closed behavior | READY | Data/verification/source-rights uncertainty is designed to block commercial use | Preserve regression coverage |
| Production/staging separation | READY/PARTIAL | Security baseline defines separation and prohibits production stress testing | Maintain isolated staging and deployment evidence |
| Browser/security headers | PARTIAL | Multiple headers implemented; full CSP source allow-list remains a known gap | Complete report-only observation and enforce tested CSP |
| Rate limiting | PARTIAL | Application/process-local controls exist | Add shared/distributed edge rate limiting for high-volume use |
| Enterprise authentication | PARTIAL | Bounded credentials/wallet developer access exists | Add customer-grade identity/RBAC/SSO where required |
| Tenant isolation | PARTIAL | Commercial entitlements are bounded by capability and subject | Document/test stronger multi-tenant isolation before sensitive enterprise scale |
| Audit trail/replay | PARTIAL/READY BY SURFACE | Risk Gate/audit evidence exists on supported workflows | Produce customer-facing retention/query procedure and scope |
| Personal-data inventory | GAP/PARTIAL BY PILOT | Low-data pilots can be designed to avoid personal data, but no complete India enterprise data inventory is published | Create formal data map before personal-data production workflows |
| Privacy notice | GAP/SCOPE_DEPENDENT | No dedicated India enterprise privacy pack is established | Establish applicable notice/process when customer personal data is processed |
| DPA | GAP/SCOPE_DEPENDENT | No standard counsel-reviewed India DPA is established | Add before processor-style customer personal-data processing where required |
| Subprocessor register | GAP | No customer-facing register is currently maintained | List hosting, database, model/API and operational subprocessors with location/purpose |
| Data-location register | GAP | Infrastructure locations are not yet packaged for diligence | Document storage, processing, backup and logging locations |
| CERT-In operating map | PARTIAL | General logging/incident controls exist | Map applicable 180-day India log retention, reporting, time sync and PoC requirements for production operations |
| Incident response | PARTIAL | Security baseline includes incident-response steps | Add customer notice/escalation contacts, severity matrix and contract/regulatory timing map |
| BCP/DR | PARTIAL | Recovery/source-of-truth principles documented | Define/test service-specific recovery and only then contract RTO/RPO |
| SLA/SLO | GAP for enterprise GA | No general enterprise SLA is claimed | Build measured service history before contractual availability/response commitments |
| Vulnerability management | PARTIAL | CI/security checks exist | Add recurring external assessment/VAPT as buyer tier requires; preserve remediation evidence |
| External certification | GAP | No SOC 2 / ISO 27001 claim | Obtain only when strategically justified; never imply before completion |
| CERT-In empanelled audit | GAP | Not currently claimed | Commission where customer/procurement/risk tier requires it |
| Audit/regulator access clauses | GAP contractually | Technical evidence can be supplied, but no standard regulated-buyer contract pack exists | Add counsel-reviewed clauses appropriate to Tier C scope |
| Subcontractor change process | GAP contractually | No standard enterprise notification process is established | Add for Tier B/C where required |
| Exit/data deletion | PARTIAL | Raw customer data is not a default product input | Create documented return/deletion/verification process before sensitive data workflows |
| Legal entity/procurement pack | GAP/PARTIAL | Product evidence exists; contracting/invoice/tax pack must match final entity | Finalize legal entity, tax, bank, signing authority and procurement documents |
| Insurance coverage | GAP/UNKNOWN | No customer-facing policy is claimed | Evaluate cyber/professional indemnity by buyer tier |

## Pilot-first rule for Tier A and Tier B

A first Indian B2B pilot should reduce risk deliberately:

- avoid personal/customer data unless it is necessary to prove the workflow;
- never ingest credentials/secrets that are not required;
- no customer production transaction authority;
- no custody;
- bounded users/API entitlement;
- explicit countries/themes/workflow;
- founder-led escalation;
- no unsupported SLA;
- written success/stop criteria;
- customer-controlled execution;
- source-rights fail-closed output;
- current country coverage taken from automated acceptance evidence, not marketing copy.

This allows Geomacro to sell useful intelligence to media and SMEs without pretending to have completed regulated-bank procurement maturity.

## Tier C minimum pack

Before representing Geomacro as ready for a material regulated production dependency, prepare at minimum:

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
13. audit/regulator-access clauses where required;
14. subcontractor/subprocessor change clauses;
15. exit, transition, data return/deletion procedure;
16. source-rights/provenance policy;
17. limitations/customer-responsibility schedule;
18. current open-risk/gap register;
19. current global/country Risk Gate acceptance report for the contracted subject scope.

## Claims policy

Allowed when current evidence supports it:

- "We can provide implemented security controls and test evidence for diligence."
- "Risk Objects are signed and independently verifiable using published key material."
- "Commercial source eligibility is enforced and unresolved rights fail closed."
- "Risk Gate provides decision context; the customer retains execution control."
- "Country coverage is reported from a current automated acceptance run."

Not allowed without additional evidence:

- "RBI compliant";
- "SEBI compliant";
- "IRDAI compliant";
- "DPDP certified";
- "CERT-In certified";
- "bank-grade" as an unqualified claim;
- "SOC 2 compliant/certified";
- "ISO 27001 certified";
- "global coverage" when the current acceptance report does not support the stated denominator;
- "production SLA" when none is contracted and evidenced.

## Review trigger

Re-review this matrix whenever any of the following changes:

- India privacy/cybersecurity rules or commencement timeline;
- buyer regulator or outsourcing classification;
- customer-data fields;
- infrastructure/subprocessor/location;
- authentication/tenant model;
- source/data provider;
- global country coverage methodology;
- enterprise SLA commitment;
- security audit/certification status;
- contracting entity.
