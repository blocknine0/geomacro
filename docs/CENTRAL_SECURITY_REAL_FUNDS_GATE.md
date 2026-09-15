# Geomacro central security and real-funds release gate

Status: **P0 mandatory release control**

This control applies centrally to Geomacro, not only to Risk Gate. It covers current public/API/server-function surfaces, developer authentication, commercial APIs, Risk Gate, Coinbase x402, GOAT x402, internal API paths and future payment routes that are added to the central payment class.

No software system can truthfully promise that hacking or data theft is impossible. The production standard is therefore layered prevention, least privilege, fail-closed behavior, retained evidence, incident kill paths and independent review. Real funds must stay disabled when required evidence or controls are absent.

## Central request boundary

`server/middleware/00-central-security.ts` runs before route handlers through Nitro. It provides one shared boundary for:

- bounded request/header/body envelopes;
- TRACE/CONNECT rejection;
- local burst protection before expensive work;
- distributed per-client and global request budgets;
- brute-force / credential-spray / payment-probe throttling before route authentication or settlement;
- shared security response headers;
- fail-closed dependency behavior on sensitive API classes;
- one real-funds release gate for current mainnet payment rails.

Route-specific authentication, idempotency, payment verification, source-rights filtering and Risk Gate validation remain defense-in-depth layers behind this boundary.

## Privacy of abuse-control data

The central abuse ledger never persists raw IP addresses, bearer/API keys, payment signatures, cookies or request bodies. A server-only HMAC digest is used as the client bucket key.

The ledger is RLS-protected and direct table/RPC access is revoked from `PUBLIC`, `anon` and `authenticated`; only `service_role` can use it.

## Real-funds hard gate

Coinbase Base mainnet or GOAT mainnet is not allowed to process through the HTTP payment path merely because its rail-specific enable flag is present.

When either current real-funds environment is selected, all of these central checks are required in addition to the rail's own acknowledgement/configuration:

```text
GEOMACRO_CENTRAL_SECURITY_MODE=enforce
GEOMACRO_REAL_FUNDS_SECURITY_ACK=I_ACCEPT_REAL_FUNDS_SECURITY_GATES
GEOMACRO_SECURITY_FINGERPRINT_PEPPER=<dedicated server-only random secret, >=32 chars>
GEOMACRO_API_CREDENTIAL_PEPPER=<dedicated server-only random secret, >=32 chars>
```

The central database migrations must also be applied. Every mainnet payment request then verifies the aggregate database posture before the route can continue.

## Database posture required before real funds

The service-role-only `central_security_database_readiness()` probe verifies security-critical tables including credentials, entitlements, credit/usage ledgers, Risk Gate auth/rate-limit/audit/idempotency stores, signed webhook outbox, agent/payment ledgers, GOAT pilot evidence and Coinbase delivery state.

The real-funds gate requires:

- every required table exists;
- row-level security is enabled on every required table;
- no required table grants direct SELECT/INSERT/UPDATE/DELETE access to `anon` or `authenticated`;
- the distributed central abuse-control RPC is operational.

The application caches a successful/failed posture result only briefly. A failed or unavailable posture check blocks real-funds requests.

## Brute-force and abuse model

Central throttling uses two concurrent budgets for each protected class:

1. a pseudonymous client budget, and
2. a route-class global budget.

The global budget is important because proxy/IP headers can be rotated or spoofed outside a trusted edge. Header rotation therefore cannot bypass every protection layer. A small in-process burst limiter runs before the database-backed distributed limiter so a single process also absorbs short spikes without turning every burst into database load.

Security classes include public API, write API, server function, Risk Gate, commercial/auth, payment and internal API traffic. Sensitive classes fail closed if the distributed security store is unavailable.

## Data-theft boundaries already retained

This central layer does not replace existing controls. Production still relies on:

- authoritative service-role database access only from server/CI code;
- RLS and revoked browser privileges on private tables;
- HMAC-keyed API credential digests rather than stored plaintext credentials;
- explicit credential revoke/expiry lifecycle;
- signed Risk Objects and public verification material;
- immutable audit/idempotency/payment delivery records where applicable;
- bounded request bodies and external-provider timeouts;
- repository/browser privileged-secret audits;
- CodeQL/dependency/security-resilience gates.

## Additional infrastructure gate

Application controls cannot absorb unlimited network-layer volumetric attacks. Before real public payment activation, the hosting/domain layer must also have a production edge/WAF or equivalent DDoS/bot protection policy, TLS-only traffic, appropriate origin protection and alerting. This must be verified as an external infrastructure gate rather than inferred from application code.

## Release rule

Real payment remains locked until all of the following are true:

1. central security migrations are applied to the authoritative production database;
2. central middleware and its tests are present in the exact deployed commit;
3. Product CI, security/resilience and CodeQL gates are green for that commit;
4. live database security readiness returns ready;
5. edge/WAF/DDoS controls are verified for the production host;
6. independent security review has no unresolved critical/high issue in the real-funds path;
7. incident response, credential rotation/revocation and rollback procedures are usable;
8. the owner explicitly authorizes the central real-funds acknowledgement;
9. the payment rail's own mainnet acknowledgement/enable flag is separately authorized.

Until then, testnet and non-revenue technical-proof work may continue, but real-funds settlement must remain disabled.
