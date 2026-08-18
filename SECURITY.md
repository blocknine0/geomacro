# Geomacro Security Policy

Security is a core requirement of Geomacro because the platform combines
external data, automated intelligence, wallet interactions, smart contracts,
and onchain financial state.

## Supported Version

Security support currently applies to the latest version of the `main` branch
and the infrastructure associated with the current Geomacro deployment.

Historical versions, forks, modified deployments, and third-party copies are
not supported by Geomacro.

## Reporting a Vulnerability

Please do **not** disclose suspected security vulnerabilities through public
GitHub issues, discussions, pull requests, or social media.

Use GitHub's private vulnerability reporting / security advisory mechanism for
this repository.

When submitting a report, please include, where possible:

- a clear description of the issue;
- the affected component;
- steps required to reproduce it;
- the potential security impact;
- relevant transaction hashes, logs, screenshots, or test cases;
- any suggested mitigation, if known.

We aim to acknowledge legitimate security reports within 72 hours.

Please allow reasonable time for investigation and remediation before making
a vulnerability public.

## Security Scope

Examples of issues that may be in scope include:

- unauthorized smart-contract actions;
- incorrect authorization or access-control behavior;
- exposure of privileged credentials or secrets;
- wallet transaction manipulation originating from Geomacro;
- vulnerabilities affecting market, dispute, resolution, finalization, or
  claim integrity;
- cross-site scripting or other application-level injection vulnerabilities;
- unauthorized access to protected application data;
- database Row Level Security failures;
- privilege escalation between public and trusted application services;
- vulnerabilities in automated lifecycle infrastructure that could result in
  unauthorized state changes;
- vulnerabilities that could materially affect user funds or protocol state.

This list is illustrative rather than exhaustive.

## Out of Scope

The following are generally outside the scope of the Geomacro security
program:

- vulnerabilities entirely within independent third-party services;
- attacks requiring compromise of a user's own wallet or device where
  Geomacro is not the source of the compromise;
- social engineering or phishing that does not originate from Geomacro;
- denial-of-service reports that rely solely on excessive traffic;
- findings against obsolete or unsupported versions;
- issues already documented by Geomacro as known testnet limitations;
- theoretical findings without a credible security impact.

Vulnerabilities affecting third-party infrastructure should normally be
reported directly to the responsible provider.

## Testnet Notice

Geomacro currently operates on testnet infrastructure.

Testnet deployments may contain known limitations, experimental parameters,
or implementation choices that are scheduled to change before production
deployment.

A documented testnet limitation is not automatically considered a previously
unknown security vulnerability.

This does not exclude reports demonstrating that a known limitation creates a
material security impact beyond its documented scope.

## Responsible Disclosure

Researchers are expected to:

- make a good-faith effort to avoid privacy violations, data destruction, and
  disruption of services;
- avoid accessing or modifying data beyond what is necessary to demonstrate
  the vulnerability;
- avoid attempting to extract private keys, credentials, or unrelated
  confidential information;
- avoid intentionally affecting other users;
- report vulnerabilities privately before public disclosure.

Do not exploit a vulnerability for financial gain or use it to interfere with
market, dispute, settlement, or protocol operations.

## Smart Contract and Financial Safety

A security report involving smart contracts should clearly distinguish
between:

- application or synchronization state;
- authoritative onchain state;
- expected protocol behavior;
- unexpected or exploitable contract behavior.

Transaction hashes, block numbers, contract addresses, and reproducible test
cases are particularly useful for these reports.

## No Bug Bounty Commitment

Geomacro does not currently operate a public bug bounty program.

Submitting a vulnerability report does not create an entitlement to payment,
compensation, employment, partnership, or any other reward unless separately
agreed to in writing.

Geomacro may introduce a formal security or bug bounty program in the future.

## Intellectual Property

Security research and vulnerability reporting do not grant a license to copy,
redistribute, deploy, commercialize, or create derivative works from the
Geomacro codebase.

Use of this repository remains governed by [LICENSE.txt](LICENSE.txt).

Nothing in this policy grants rights to the Geomacro name, trademarks,
branding, proprietary data, or other intellectual property.

## Contact

For security matters, use the private security reporting mechanism provided
for this repository.

For non-security matters, use an official Geomacro contact channel identified
in the repository.

---

Copyright © 2026 Geomacro. All rights reserved.
