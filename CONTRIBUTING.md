# Contributing to Geomacro

Thank you for your interest in Geomacro.

Geomacro is a proprietary software project. The source code in this
repository is publicly viewable for technical evaluation, security review,
and project assessment, but it is not an open-source codebase.

Please review [LICENSE.txt](LICENSE.txt) before using any source code from
this repository.

## Contributions

Geomacro does not currently accept unsolicited feature implementations or
large pull requests.

If you identify a bug, documentation issue, compatibility problem, or
potential improvement, please open an issue first so the proposed change can
be discussed before implementation.

A request for discussion, review, or contribution does not grant permission
to copy, modify, redistribute, deploy, or commercially use the Geomacro
codebase outside the terms of [LICENSE.txt](LICENSE.txt).

Maintainers may accept, reject, or close proposed changes at their
discretion.

## Development Standards

For changes explicitly coordinated with the Geomacro maintainers:

- keep server-only logic out of client imports;
- never expose private keys, service-role credentials, API secrets, or other
  privileged credentials through client-side environment variables;
- preserve wallet-controlled signing for user-initiated onchain actions;
- validate client-facing data through an explicit allowlist or equivalent
  sanitization boundary;
- preserve V1/V2 compatibility where the affected subsystem requires it;
- treat onchain contract state as authoritative for financial actions;
- do not silently suppress operational errors;
- ensure scheduled automation has both executable logic and the required
  workflow configuration;
- update completion state only after the operation it represents has
  successfully completed.

Changes should pass the repository's applicable linting, type checking, and
test requirements before review.

## Security Issues

Do **not** open a public GitHub issue for a suspected security vulnerability.

Please use GitHub's private security reporting / security advisory mechanism
for vulnerabilities that could affect users, funds, smart contracts,
credentials, infrastructure, or other sensitive systems.

See [SECURITY.md](SECURITY.md) for the current disclosure policy.

## Reusable Primitives

The licensing restrictions of the main Geomacro repository do not
automatically apply to reusable components that Geomacro explicitly publishes
in a separate repository.

Reusable Arc infrastructure primitives are maintained separately and are
governed by the license included with that repository.

## Intellectual Property

Submitting an issue, participating in a technical discussion, or proposing a
change does not grant rights to Geomacro's source code, trademarks, branding,
data, or other intellectual property.

Any contribution that Geomacro agrees to accept may be subject to additional
contribution or intellectual-property terms before it is incorporated into
the proprietary codebase.

## Contact

For contribution-related questions, use an official Geomacro contact channel
identified in this repository.

---

Copyright © 2026 Geomacro. All rights reserved.
