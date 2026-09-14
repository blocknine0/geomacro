# India Buyer Readiness Matrix

Status: permanent commercial control for India until revised.
Last reviewed: 2026-09-14.

Purpose: match Geomacro's onboarding, security, privacy and contractual burden to the actual buyer and service risk. A small media pilot must not inherit the procurement burden of a regulated bank deployment, while a regulated buyer must not receive a lightweight pilot pack presented as enterprise compliance.

This is a product/commercial control, not legal advice or a claim of regulator approval.

## Readiness tiers

### Tier A — Media / Research Starter

Typical buyers:
- business-news desks;
- specialist media;
- research boutiques;
- independent analysts;
- policy/economic research teams.

Minimum before sale:
- written pilot scope and price;
- named buyer contact and authorized users;
- agreed countries/themes;
- source-rights and attribution boundary;
- clear statement that raw third-party data is not being resold;
- access credentials kept private;
- basic support/escalation contact;
- pilot success metrics;
- no production SLA claim;
- no customer PII required by default.

Media-specific publication rule:
- Geomacro-derived insight may be used only within the agreed commercial scope;
- third-party source excerpts, images, article bodies or datasets do not inherit Geomacro's commercial rights;
- any customer-facing attribution requirement in the SOW must be followed;
- editorial judgment remains with the customer.

### Tier B — SME / Professional Country Risk

Typical buyers:
- import/export companies;
- manufacturers;
- logistics/freight businesses;
- commodity/input buyers;
- corporate strategy teams;
- boutique consulting/advisory firms.

Minimum before sale:
- everything in Tier A;
- exact business use case;
- bounded country/exposure list;
- country/readiness check for any Risk Gate feature;
- API/export limits if used;
- customer responsibility and decision boundary;
- simple data-retention/deletion statement for customer-provided data;
- named incident/support contact;
- pilot-end evidence/ROI report.

Do not require enterprise SSO, formal SLA, external audit or regulator clauses unless the actual scope or customer procurement process requires them.

### Tier C — Technical / Fintech / Enterprise AI

Typical buyers:
- fintech;
- treasury technology;
- payments infrastructure;
- enterprise AI/data platforms;
- autonomous-agent builders.

Minimum before production-like technical pilot:
- everything in Tier B;
- architecture/data-flow diagram for the integration;
- authenticated bounded API entitlement;
- credential rotation/revocation procedure;
- tenant/access boundary documented;
- request/readiness gate for the exact Risk Gate action profile;
- audit/logging boundary documented;
- incident escalation contact;
- subprocessor/data-location disclosure appropriate to the integration;
- privacy/DPA review if customer personal data will be processed;
- security baseline and current test evidence;
- rate/usage limits;
- explicit non-execution boundary;
- rollback/disable path.

### Tier D — Regulated / Large Enterprise

Typical buyers:
- banks;
- NBFCs;
- insurers;
- brokers/asset managers and other SEBI-regulated entities;
- large enterprises with formal third-party-risk procurement.

This is not the initial GTM target.

Before representing Geomacro as ready for a material production deployment, prepare the buyer-specific package as required by scope:
- final contracting entity, invoicing/tax and signing-authority documents;
- service description and architecture;
- customer data-flow/data-classification map;
- privacy notice/data processing terms where applicable;
- subprocessor and data-location register;
- access-control and secret-management evidence;
- vulnerability/patch-management process;
- current security/resilience evidence;
- incident-response process and escalation matrix;
- business-continuity/disaster-recovery plan and tested evidence;
- SLA/SLO only where backed by measured evidence and contract;
- audit/regulator-access clauses where required;
- subcontractor/subprocessor change terms;
- exit, data return and deletion process;
- customer-specific security questionnaire;
- external VAPT/security assessment where the buyer requires it;
- cyber/professional insurance assessment where required.

## India regulatory context for the regulated-buyer track

### Digital Personal Data Protection

The Digital Personal Data Protection Rules, 2025 were notified on 14 November 2025 with phased commencement.

Official reference:
`https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025`

Commercial rule:
- do not claim "DPDP certified";
- determine whether a concrete customer workflow processes digital personal data;
- if it does, map roles, purpose, fields, access, retention/deletion, security and incident handling before production use;
- default early pilots should avoid unnecessary customer personal data.

### CERT-In directions

CERT-In directions dated 28 April 2022 include cyber-incident and ICT-log requirements applicable to covered entities, including a rolling 180-day log-retention requirement in India for specified entities.

Official reference:
`https://www.cert-in.org.in/Directions70B.jsp`

Commercial rule:
- do not claim "CERT-In certified";
- for an applicable deployment, map logging, retention, location, incident and notification obligations to the actual service architecture before promising compliance;
- do not make media/SME pilots artificially heavy where the specific obligation does not apply to the service scope.

### RBI IT outsourcing and governance

RBI issued the Reserve Bank of India (Outsourcing of Information Technology Services) Directions, 2023 on 10 April 2023 for covered regulated entities.

Official reference:
`https://www.rbi.org.in/`

RBI also issued Master Direction on Information Technology Governance, Risk, Controls and Assurance Practices on 7 November 2023.

Commercial rule:
- a covered RBI-regulated buyer may require service-provider due diligence, confidentiality, audit/access rights, subcontractor controls, incident handling, BCP/DR, data/exit controls and other third-party-risk evidence;
- Geomacro must satisfy the buyer's exact procurement classification before claiming production readiness;
- never use an unqualified "RBI compliant" claim.

### SEBI cybersecurity framework

SEBI issued the Cybersecurity and Cyber Resilience Framework for SEBI Regulated Entities on 20 August 2024, with later implementation clarifications.

Official reference:
`https://www.sebi.gov.in/legal/circulars/aug-2024/cybersecurity-and-cyber-resilience-framework-cscrf-for-sebi-regulated-entities-res-_85964.html`

Commercial rule:
- regulated securities buyers may require stronger vendor-security and resilience evidence than an ordinary pilot;
- never claim "SEBI compliant" without a buyer-specific legal/control assessment.

### IRDAI

IRDAI's information/cyber-security requirements can affect insurer and intermediary procurement.

Official reference:
`https://irdai.gov.in/`

Commercial rule:
- treat insurer procurement as Tier D unless the buyer explicitly scopes a low-risk research pilot;
- never claim "IRDAI compliant" without evidence and appropriate review.

## Technical/product readiness matrix

| Area | Tier A | Tier B | Tier C | Tier D | Current Geomacro position |
| --- | --- | --- | --- | --- | --- |
| Product scope and limitations | Required | Required | Required | Required | Ready |
| Source-rights gate | Required | Required | Required | Required | Ready, fail-closed |
| Country Risk Gate readiness census | Optional unless Risk Gate sold | Required if Risk Gate sold | Required | Required | Being operationalized as permanent evidence |
| Exact action-profile readiness | Not normally applicable | Scope dependent | Required | Required | Request-readiness gate implemented |
| Signed Risk Objects | Optional | Scope dependent | Core option | Scope dependent | Implemented |
| Public signature verification | Optional | Scope dependent | Required when signed objects used | Required when signed objects used | Implemented |
| `execution_authorized=false` | Required if Risk Gate shown | Required | Required | Required | Ready |
| Basic account/access controls | Required | Required | Required | Required | Ready for controlled pilots |
| Enterprise SSO/RBAC | No | No | Scope dependent | Often required | Gap/partial |
| Shared/distributed high-volume rate limiting | No | Scope dependent | Required at scale | Required | Partial |
| Security regression evidence | Basic | Basic | Required | Required | Implemented for scoped launch gates |
| External security assessment | No | Usually no | Buyer dependent | Commonly required | Not generally completed/certified |
| Privacy/data map | Minimal if no PII | Scope dependent | Required if customer data used | Required | Needs buyer-specific completion |
| DPA | No if no processing role | Scope dependent | Scope dependent | Often required | Counsel review required |
| Subprocessor/data-location register | Optional | Scope dependent | Required for diligence | Required | Needs customer-facing package |
| Incident process | Basic contact | Basic process | Required | Required | Partial, formal customer pack to mature |
| BCP/DR evidence | No formal promise | Scope dependent | Buyer dependent | Required | Partial; do not promise untested RTO/RPO |
| SLA | No | No by default | Optional only if measured/contracted | Often required | No general production SLA claim |
| Legal/procurement pack | Lightweight | Lightweight | Standard | Full | Depends on final contracting entity |

## Claims control

Allowed when supported by current evidence:
- "Geomacro provides explainable geopolitical and macro risk intelligence."
- "Supported Risk Objects are cryptographically signed and independently verifiable."
- "Commercial source eligibility is governed and unresolved rights fail closed."
- "Risk Gate provides decision context; customer execution remains outside Geomacro."
- "This pilot covers the countries/workflow listed in the SOW."

Not allowed unless separately evidenced:
- "all countries are supported";
- "all Risk Gate workflows are supported";
- "bank-grade" as a blanket claim;
- "RBI compliant";
- "SEBI compliant";
- "IRDAI compliant";
- "DPDP certified";
- "CERT-In certified";
- "SOC 2 certified";
- "ISO 27001 certified";
- "production SLA" where none is contracted and measured.

## Promotion rule

A buyer may move to a higher tier only after its additional controls are complete for the actual service scope. Sales urgency must not override technical, source-rights, privacy or security gates.

Review this matrix when regulation, customer data fields, infrastructure, authentication, subprocessors, contracting entity, source providers, supported Risk Gate modules or security status changes.
