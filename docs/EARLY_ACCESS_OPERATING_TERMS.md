# Geomacro Early Access Operating Terms

**Status:** canonical founder-use operating standard for controlled Early Access / founding pilots.  
**Effective review date:** 2026-09-15.  
**Public status:** not general public pricing, not general availability, not an enterprise SLA, and not a substitute for a signed customer agreement or legal review.

This document closes the internal operating boundary for the first paid Geomacro pilots. It must be read together with:

- `docs/EARLY_ACCESS_COMMERCIAL_PACKAGE.md` for the buyer/workflow offer;
- `docs/FOUNDING_PILOT_PRICING_GUARDRAILS.md` for global quote anchors;
- `docs/INDIA_B2B_PACKAGE.md` for India-specific quote anchors;
- `docs/INDIA_PILOT_SOW_TEMPLATE.md` for customer-specific scope;
- `docs/COMMERCIAL_SOURCE_RIGHTS.md` for deliverable source-rights boundaries;
- `docs/SECURITY_OPERATIONS_BASELINE.md` for security and incident controls.

A customer-specific signed SOW/agreement overrides this internal standard only where the deviation is explicit, commercially approved and operationally supportable.

## 1. Availability and product status

Geomacro Early Access is a **controlled founding-pilot service**, not broad production/general availability.

Current sellable pilot surfaces, subject to the exact readiness and source-rights state at the time of delivery, are:

- explainable Risk Intelligence;
- current verified Global Risk Index context where relevant;
- evidence, confidence, freshness and change context;
- signed Geomacro Risk Objects where supported;
- bounded authenticated Data/API access where agreed;
- current Risk Gate country or directional endpoint-composed corridor evaluation where the exact request is supported.

The current Risk Gate boundary remains:

`execution_authorized=false`

Geomacro does not authorize, sign, broadcast or custody customer transactions and does not replace required legal, sanctions, KYC/AML, compliance or fiduciary controls.

## 2. Founding-pilot price standard

The canonical global founding-pilot quote anchors remain:

| Pilot | Default 30-day quote | Default scope |
|---|---:|---|
| Analyst / operational workflow | USD 1,500 | One defined human-reviewed workflow, normally up to two countries or one directional corridor |
| Risk API / Risk Gate technical pilot | USD 2,500 | One defined machine-readable integration workflow with bounded API/Risk Gate support |
| Strategic design partner | Individually quoted | Only where the partner provides documented strategic value beyond ordinary pilot feedback |

A full 30-day founding pilot must not be quoted below **USD 750** without a written strategic reason. A lower-priced, materially narrower productized evaluation may exist only where its scope is explicitly separated from a full founding pilot, as documented for the India Media & Research Starter Evaluation.

These are founder-use quote anchors, not website list prices. Final quotes may increase for additional geographies, workflows, users, API volume, bespoke research, custom integration, procurement/security work or licensed-data cost.

Arc Testnet, x402, Testnet USDC or other technical-proof pricing must never be used as institutional price anchors.

## 3. Pilot term, invoicing and renewal

Default commercial structure:

- fixed 30-day pilot term;
- fixed written scope and success criteria before kickoff;
- payment before or at pilot start where commercially practical;
- no automatic renewal by default;
- material scope expansion is quoted and accepted before work begins;
- continuation, expansion or stop decision is scheduled before pilot end.

Taxes, invoicing mechanics, contracting entity and payment rail are set in the customer-specific agreement/SOW.

## 4. Usage and quota boundary

There is no unlimited-use Early Access tier.

Each SOW must state, where relevant:

- authorized users/systems;
- countries/corridors/exposures;
- API or Risk Gate request allowance;
- export/delivery allowance;
- integration/workflow boundary;
- permitted customer use and publication/reuse rights.

Credentials may be used only by authorized customer users/systems. Credential sharing, technical-limit circumvention, resale or redistribution outside the agreement is not permitted.

A quota increase is a scope change and may require readiness review, capacity evidence and re-pricing.

## 5. Support model

### Primary support path

Canonical support/contact email: `contact@geomacro.live`.

A customer SOW may name an additional shared chat/channel, but the email remains the durable escalation path unless the agreement explicitly replaces it.

### Default support window

Founder-supported Early Access is **not 24/7 support**.

Default operating window:

- Monday to Friday;
- 10:00 to 18:00 Asia/Kolkata;
- excluding days when Geomacro has explicitly notified the pilot that support is unavailable.

A buyer-specific overlap window may be agreed in the SOW. An agreed overlap window does not create 24/7 coverage.

### Best-effort acknowledgement targets

These are operating targets for a controlled pilot, **not contractual response-time SLAs unless the signed SOW expressly makes them contractual**.

| Priority | Example | Internal acknowledgement target during support window |
|---|---|---|
| Critical | suspected credential/signing compromise, material integrity failure, or a response that appears to violate the execution boundary | as soon as practicable; target within 4 business hours |
| High | scoped Risk Gate/API path unavailable or consistently failing closed because of a service dependency | same business day where reported during the support window |
| Normal | partial degradation, data/freshness question, non-blocking integration issue | within 2 business days |
| Request | feature request, custom analysis or scope expansion | triage within 3 business days; delivery only after scope agreement |

Support does not include open-ended bespoke engineering, customer production operations, customer transaction execution or customer incident response unless separately contracted.

## 6. Service-level boundary

Unless a signed agreement explicitly states otherwise, Early Access includes **no contractual**:

- uptime percentage;
- latency guarantee;
- throughput guarantee;
- guaranteed support-response time;
- RTO;
- RPO;
- 24/7 monitoring or on-call coverage;
- business-continuity commitment beyond the controls documented in the current security/operations baseline.

Fail-closed behavior is an intentional safety control. An unavailable, stale, unsupported or unverifiable output must not be interpreted as low risk or authorization.

Future production SLAs may be offered only after measured staging/production operating evidence and support capacity justify them.

## 7. Incident severity and operating response

### Critical incident

Examples:

- suspected exposure of a privileged API/signing/database credential;
- suspected unauthorized access to customer-scoped data or credentials;
- loss of Risk Object signing/integrity assurance;
- any output that could plausibly violate the permanent `execution_authorized=false` boundary;
- confirmed material corruption of the scoped risk output.

Operating response:

1. suspend/isolate the affected capability where safe;
2. preserve evidence and deployment/commit identifiers;
3. revoke/rotate the affected credential or key where exposure is plausible;
4. verify integrity boundaries before restoration;
5. fix and re-test through source control;
6. restore only from an identified reviewed version;
7. provide an affected-customer summary when facts support one and applicable obligations require it.

### High incident

Examples:

- the scoped authenticated Risk Gate/API path is unavailable;
- rate-limit, audit-persistence, verification-key or required database dependency failure causes broad fail-closed behavior;
- a current supported country/corridor becomes unavailable because required verified evidence is no longer usable.

Operating response: contain the affected feature, communicate known scope, remediate/re-test, then restore. Do not bypass fail-closed controls to improve availability.

### Moderate incident / degradation

Examples:

- partial country/exposure degradation;
- freshness lag that remains clearly surfaced to the user;
- delayed non-critical export/research output;
- isolated integration issue without integrity/security impact.

Operating response: record, triage and repair within the normal support process. Do not relabel stale or unsupported evidence as current merely to keep a pilot green.

## 8. Customer incident communication

For a material incident affecting the customer's scoped pilot, Geomacro will use the SOW's named contact path and communicate based on verified facts.

The default operating rule is:

- notify the affected customer as soon as reasonably practicable after sufficient facts establish material impact;
- distinguish confirmed facts from investigation status;
- provide material status changes when useful;
- avoid unsupported root-cause or restoration-time promises;
- provide a concise closure/remediation summary when appropriate.

No fixed statutory notification period is created by this internal document. Applicable law and the signed customer agreement control legal notification duties.

## 9. Suspension and stop authority

Geomacro may suspend or narrow an affected feature/output when necessary to preserve:

- source/licensing rights;
- data freshness or evidence sufficiency;
- signature/integrity assurance;
- security and credential safety;
- rate-limit/audit fail-closed behavior;
- the agreed product/workflow scope.

A suspension is preferable to silently serving unverified or ineligible intelligence.

Customer misuse, credential compromise, attempts to circumvent limits, or use outside the contracted workflow may also trigger suspension pending review.

## 10. Customer-use boundary

Geomacro output is external decision-support context. The customer remains responsible for:

- identity and permissions;
- customer-side policy enforcement;
- legal/compliance/sanctions/KYC/AML controls;
- fiduciary or operational judgment;
- funds and transaction signing;
- downstream execution;
- validating whether the output is appropriate for the customer's regulated or contractual obligations.

Risk Gate recommendations and compatibility fields such as `ALLOW` / `BLOCK` remain advisory. `ALLOW` is not transaction permission or compliance clearance.

## 11. Source rights, attribution and redistribution

Paid delivery is limited by the current governed commercial source-rights policy.

A customer receives only the use rights expressly granted in the SOW/agreement for Geomacro-derived deliverables. Third-party raw source rights are not transferred merely because the source informed Geomacro intelligence.

Required provider attribution must be retained where applicable. Raw dataset/article/media redistribution is allowed only where the exact reviewed source contract permits it and the customer agreement expressly includes it.

A source-rights change may cause a previously available input or output to fail closed or be removed from paid delivery.

## 12. Intellectual property and pilot-use principle

Unless a signed agreement says otherwise:

- Geomacro retains its software, methodology, schemas, scoring logic, Risk Gate logic, documentation and general know-how;
- the customer receives a limited, non-exclusive, non-transferable right to use the contracted Geomacro-derived pilot outputs for the agreed internal workflow;
- no right to resell the Geomacro service, API access, methodology or third-party source material is implied;
- customer-owned confidential information remains subject to the signed agreement/NDA where applicable.

Final IP, confidentiality, publication and retained-output rights must be stated in the customer agreement when they materially matter.

## 13. Customer data and privacy

Default Early Access design minimizes customer data and avoids customer personal data unless genuinely required.

The SOW must identify any customer-provided data, its purpose and its retention/deletion rule. Personal-data processing on the customer's behalf requires the appropriate privacy/data-processing terms before processing begins.

Geomacro must not ask for or retain customer private keys, wallet seed phrases or unnecessary privileged credentials.

## 14. Security claims

The buyer may receive the current repository/security evidence appropriate to the scoped pilot.

Do not claim that Early Access is:

- SOC 2 certified;
- ISO 27001 certified;
- independently penetration-tested/audited;
- RBI/SEBI/IRDAI/CERT-In approved or certified;
- unhackable;
- backed by a production SLA;

unless current independent evidence actually supports the exact claim.

## 15. Pilot success and continuation

Every founding pilot must end with documented evidence against buyer-specific success criteria and one explicit outcome:

- `STOP`;
- `CONTINUE`;
- `EXPAND`.

A recurring or wider deployment is not automatic. It requires current source rights, security/readiness, capacity, support and customer-value evidence appropriate to the expanded scope.

## 16. Legal-contract boundary

This document is an internal commercial/operating standard, not a complete legal contract and not legal advice.

Before a final customer agreement is signed, add or review as appropriate:

- contracting entity and authority;
- taxes and payment terms;
- confidentiality/NDA terms;
- warranties and disclaimers;
- limitation of liability;
- indemnities;
- governing law and dispute resolution;
- termination/refund rights;
- data protection/DPA requirements;
- security/procurement schedules;
- any buyer-specific audit or regulatory obligations.

The SOW must not silently promise a capability, service level, certification or legal right that is absent from current production evidence.
