# Geomacro India Pilot Statement of Work Template

Status: commercial working template. Must be adapted to the customer and reviewed by appropriate counsel before being used as a final legal contract where required.
Last reviewed: 2026-09-15.
Canonical operating standard: `docs/EARLY_ACCESS_OPERATING_TERMS.md`.

This template is intentionally short enough for early media/SME pilots while preserving Geomacro's source-rights, product and execution boundaries.

## 1. Parties and pilot

Customer: `[legal/customer name]`

Geomacro contracting party: `[final entity / proprietor / company as applicable]`

Pilot tier:
- `[ ] Media & Research Starter`
- `[ ] SME Country Risk Monitor`
- `[ ] Professional Risk Intelligence`
- `[ ] Risk API + Risk Gate Technical Pilot`
- `[ ] Custom controlled pilot`

Pilot start: `[date]`

Pilot end: `[date]`

Pilot fee: `INR [amount]` plus applicable taxes, if any.

Payment terms: `[for example: 100% before kickoff / agreed milestone schedule]`.

## 2. Business objective

The pilot is intended to test this concrete customer problem:

`[one-sentence problem statement]`

Primary decision/research workflow:

`[specific workflow, not a broad product description]`

Examples:
- monitor geopolitical and macro changes affecting specified supplier countries;
- support a media research desk covering specified countries/themes;
- assess country exposure before internal procurement review;
- consume machine-readable country risk in an internal test environment.

## 3. Scope

Countries/exposures included:

`[ISO3 / country names / themes / agreed exposure list]`

Maximum included countries/themes: `[number]`.

Authorized users: `[number / named team]`.

Included product surfaces:
- `[ ] Risk Intelligence`
- `[ ] country monitoring`
- `[ ] evidence/provenance/confidence/freshness context`
- `[ ] structured export`
- `[ ] signed Risk Object`
- `[ ] API access`
- `[ ] supported Risk Gate country-review workflow`
- `[ ] founder-led risk brief/review`
- `[ ] other: ...`

Any Risk Gate use is limited to the exact country and action profile that passes Geomacro's current production readiness gates at the time of use.

## 4. Deliverables

Geomacro will provide the following during the pilot:

1. `[access/deliverable]`
2. `[access/deliverable]`
3. `[weekly review/report if included]`
4. pilot-end evidence and outcome review.

For media/research pilots, Geomacro may provide derived intelligence, structured notes, evidence links and risk context within the agreed scope. Raw third-party articles, datasets, images or other protected source material are not included unless Geomacro separately has the right to deliver them.

## 5. Access and usage limits

API/request limit if applicable: `[limit]`.

Export limit if applicable: `[limit]`.

Access credentials are customer-confidential and may be used only by authorized users/systems.

The customer must not:
- share credentials outside the authorized team;
- circumvent technical limits;
- resell or redistribute Geomacro access unless a separate agreement permits it;
- imply ownership or redistribution rights in third-party source material;
- use Geomacro as a substitute for required legal, sanctions, KYC/AML, fiduciary or regulatory controls.

## 6. Country and workflow readiness

Geomacro maintains separate readiness gates for country coverage and workflow/action support.

A country being present in Geomacro's registry does not itself mean that the country is currently supported for a commercial Risk Gate decision.

A country/workflow output may be unavailable or fail closed when:
- a required risk module is missing;
- evidence is stale or insufficient;
- source rights are unresolved or ineligible;
- cryptographic/integrity verification fails;
- the requested action activates a module that is not production-supported;
- required system dependencies are unavailable.

Fail-closed behavior is part of the service safety model and is not treated as authorization to infer low risk.

## 7. Risk Gate and execution boundary

Risk Gate provides external risk context evaluated against an agreed policy/profile.

Geomacro does not:
- authorize customer transactions;
- hold or control customer funds;
- broadcast customer transactions;
- perform KYC/AML or sanctions clearance unless a separately implemented and contracted service explicitly says so;
- replace customer legal/compliance/fiduciary judgment.

`execution_authorized=false` remains the Geomacro boundary for Risk Gate output.

## 8. Source rights and attribution

Only data/evidence allowed by Geomacro's current commercial source-rights policy may contribute to paid customer output.

Unresolved, blocked or ineligible source states fail closed or are excluded according to the governed methodology.

Customer publication/reuse rights in Geomacro-derived output are limited to the rights expressly granted in this SOW or another signed agreement.

Where attribution is required, the customer will preserve the agreed attribution.

Third-party raw source rights remain with the relevant source/provider and are not transferred by this pilot.

## 9. Customer data and privacy

Default early-pilot design: avoid customer personal data unless it is genuinely necessary for the use case.

Customer data supplied to Geomacro for the pilot:

`[none / list fields and purpose]`

Permitted purpose:

`[purpose]`

Retention/deletion rule:

`[duration / deletion at end / other]`

If the scope requires Geomacro to process personal data on the customer's behalf, the parties will complete the required privacy/data-processing terms before that processing begins.

## 10. Security

Geomacro will maintain the security controls represented in its current pilot security baseline and evidence package for the scoped service.

No SOC 2, ISO 27001, CERT-In, RBI, SEBI, IRDAI or other certification/approval is implied unless expressly stated with current evidence.

Customer must promptly report suspected credential compromise or misuse.

Security contact: `[contact]`.

## 11. Support and incidents

Pilot support channel: `[email/chat channel]`.

Normal support window: `[buyer-specific window; if omitted, use the current default in docs/EARLY_ACCESS_OPERATING_TERMS.md]`.

Pilot escalation contact: `[contact]`.

Unless expressly added in writing, this controlled pilot does not include a general production uptime SLA, guaranteed response time, RTO or RPO.

If a material service/security incident affects the scoped pilot, Geomacro will communicate through the agreed contact path based on the facts and applicable obligations.

## 12. Success criteria

The pilot will be judged using these agreed metrics:

- requested-country/exposure service rate: `[target]`;
- evidence/freshness coverage target: `[target]`;
- useful-signal or analyst-acceptance target: `[target]`;
- false-positive/false-block observation target where measurable: `[target]`;
- research/analyst time saved: `[target]`;
- API integration success/latency target if applicable: `[target]`;
- customer conversion/expansion decision at pilot end: `[yes/no process]`.

Only metrics relevant to the actual pilot should be retained.

## 13. Customer responsibilities

Customer will:
- identify the intended use and relevant exposures accurately;
- keep credentials secure;
- make its own operational/editorial/legal/compliance decisions;
- provide timely feedback needed to measure pilot success;
- not present Geomacro output outside the agreed scope as a guarantee, official rating or regulatory clearance;
- comply with agreed source/attribution restrictions.

## 14. Change control

Any material change to countries, workflow, users, request volume, data fields, publication rights or integration scope must be agreed in writing before it becomes part of the pilot.

A change that activates a currently unsupported Risk Gate module requires a new readiness review and may require additional engineering, price or timeline.

## 15. Suspension / stop conditions

Geomacro may suspend the affected feature or output when necessary to preserve source rights, integrity, security or fail-closed behavior, including when:
- a source's commercial-use status changes;
- data is stale/insufficient;
- a signing/integrity control fails;
- misuse or credential compromise is suspected;
- the requested workflow falls outside the agreed scope.

The parties will decide whether to resume, narrow, replace or stop the affected pilot scope.

## 16. End of pilot

At pilot end Geomacro will provide the agreed outcome/evidence review.

Customer/Geomacro will choose one of:
- convert to recurring subscription;
- expand scope;
- extend the controlled pilot;
- pause pending additional product/readiness work;
- stop.

Customer-provided data will be handled according to the agreed retention/deletion rule and any applicable contractual/privacy obligations.

## 17. Commercial/legal terms not replaced by this template

The final agreement may need additional clauses covering confidentiality, intellectual property, taxes, warranties/disclaimers, liability, indemnity, governing law, dispute resolution, termination, data protection, audit rights or procurement requirements depending on the customer and pilot tier.

Those terms should be added through the appropriate agreement rather than implied by product copy.

## Approval

Customer authorized representative: `[name / title / signature / date]`

Geomacro authorized representative: `[name / title / signature / date]`
