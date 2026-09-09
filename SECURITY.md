# Geomacro Security Policy

Security, data integrity and operational resilience are release requirements for Geomacro because the product combines external evidence, automated intelligence, signed Risk Objects, APIs, wallet-facing technical proof, smart contracts and privileged infrastructure.

## Supported version

Security support applies to the latest `main` source and the infrastructure explicitly associated with the current Geomacro deployment. Historical versions, forks, modified deployments and third-party copies are not supported by Geomacro.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities through public GitHub issues, discussions, pull requests or social media.

Use the private contact channel at:

- https://geomacro.live/contact

If GitHub private vulnerability reporting is visibly available for this repository, that channel may also be used.

A useful report includes the affected surface, prerequisites, steps to reproduce, likely impact and a minimal proof of concept where safe. Transaction hashes, block numbers and test cases are particularly useful for smart-contract or wallet-related reports.

Do not send private keys, seed phrases, service-role credentials, signing keys, OTPs or unrelated confidential information.

## Security scope

Examples of material findings include:

- unauthorized smart-contract or privileged application actions;
- authentication, authorization or access-control bypass;
- credential, signing-key or secret exposure;
- wallet transaction manipulation originating from Geomacro;
- failures affecting signed Risk Object integrity or verification;
- Risk Gate boundary violations, especially any path where `execution_authorized` could become true;
- cross-site scripting, injection or server-side request abuse;
- unauthorized access to protected application or database data;
- Row Level Security or service-boundary failures;
- privilege escalation between public and trusted services;
- lifecycle infrastructure behavior that can cause unauthorized state changes;
- vulnerabilities that materially affect user assets or protocol state.

## Research boundaries

Please avoid actions that could harm users or production systems, including:

- accessing or changing data that is not yours;
- destructive production testing;
- denial-of-service or high-volume load testing against `geomacro.live`;
- phishing, social engineering or credential theft;
- moving, staking, claiming or otherwise using assets that are not yours;
- extracting or attempting to use private keys or privileged credentials;
- automated scanning that materially degrades service availability.

Use isolated test environments and test assets wherever possible.

Findings entirely within independent third-party infrastructure should normally be reported to the responsible provider unless Geomacro's integration materially creates or amplifies the vulnerability.

## Response and launch policy

Reports are triaged by impact, exploitability and affected trust boundary. Critical and high-severity findings block external launch of the affected capability, or are remediated and re-tested before that capability is treated as release-ready.

Geomacro preserves evidence for material security and resilience tests where practical. Security statements are limited to what has actually been tested.

Geomacro does not describe the system as "unhackable" and does not imply a third-party audit, certification or compliance status unless one has actually been obtained.

## Product boundaries

- Risk Gate is decision-support infrastructure and does not authorize customer execution. `execution_authorized=false` is a permanent product boundary.
- Geomacro does not custody customer wallets or request customer signing keys.
- Arc, Circle and event-market integrations are technical-proof surfaces unless explicitly stated otherwise.
- Structural evidence is not silently converted into GRI input outside the published methodology contract.

## Testnet notice

Current Arc/onchain surfaces operate on testnet infrastructure. Testnet deployments can contain experimental parameters and documented limitations. A documented limitation is not automatically a previously unknown vulnerability, but a report showing materially greater impact remains relevant.

## No bug-bounty commitment

Geomacro does not currently promise a public monetary bug bounty. Submission of a report does not create an entitlement to compensation, employment, partnership or another reward unless separately agreed in writing.

## Intellectual property

Security research and vulnerability reporting do not grant a license to copy, redistribute, deploy, commercialize or create derivative works from the Geomacro codebase. Repository use remains governed by [LICENSE.txt](LICENSE.txt).

---

Copyright © 2026 Geomacro. All rights reserved.
