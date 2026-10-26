# Supabase-free Predge Risk Gate — Cloudflare D1 handoff (20 October 2026)

**Scope:** the public `POST /api/risk-gate` request path now delegates to
`POST /v1/partner/predge/risk-gate` on the existing D1 Worker. This does NOT
eliminate unrelated Supabase-dependent endpoints, background jobs, old source
files, source registries or legacy consumers from the entire Geomacro repo.

## Single authority for this request path

- **Authentication:** separate `PREDGE_RISK_GATE_TOKEN` (64 lowercase hex),
  protected production environment secret. No admin ledger token, public
  research token, signup, password or plain-text credential storage. Endpoint
  denies requests if the secret is missing/reused. This is **different** from
  `PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE` and cannot revoke the exposed
  credential from 19 October. Rotate that separately.
- **Database:** existing Cloudflare D1, with migrations
  `0020_predge_risk_gate_d1.sql`, no new paid subscription. Atomic 100/day
  quota with 500/day code and CHECK ceiling. No raw upstream articles.
  `(client_id,request_id)` idempotency uniqueness and durable decision replay.
- **Data:** verified country GRO from `country_gro_verified_hot`; corridor
  requires a separately signed real corridor GRO admitted to
  `corridor_gro_verified_hot`. The existence of the table does not
  automatically fill it.
- **Trust:** verify exact stored record hash, full canonical signed payload
  SHA-256, Ed25519 against both protected registry and canonical active-key pin,
  freshness (3-hour max), original issuer, subject, evidence, and signed
  verification/commercial eligibility. Unscored free feed is not a GRO.
  A test-key signed fixture cannot pass.
- **Decision:** import the actual canonical `evaluateRiskGate` engine;
  preserve `risk-gate-1.0` response, no execution authorization.
- **Fail closed:** missing signed current GRO, D1 unavailable, missing or
  mismatched trust key, stale/expired artifact, quota exhaustion and failed
  decision-audit write never produce a 200 approval. `execution_authorized`
  remains false on errors and successes.

## Owner-controlled protected provisioning (no plaintext in repository)

1. Identify the credential in the 19 October email. If it was Geomacro's
   research token, independently rotate
   `PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE` in the protected **production**
   environment, deploy and verify the **old** token gets 401 and new one 200.
   Removing the override without changing the HMAC root **does not revoke**
   an exposed fallback-derived token. If another issuer owns the token,
   revoke at that issuer.
2. Generate a **separate** random 64-lowercase-hex token locally for Risk Gate,
   and enter it as the GitHub protected **production** secret
   `PREDGE_RISK_GATE_TOKEN`. Do not put it in a workflow input, commit,
   issue, email, chat, query string or logs. Do not reuse the free-research
   token. The protected deploy workflow installs the secret into the Worker.
3. Confirm existing `RISK_OBJECT_VERIFY_KEYS_JSON` is a trusted server-side
   map keyed by `geomacro-risk-2026-03`, with `status:"active"` and the same
   pinned SPKI public key as `src/lib/risk-object-public-registry.ts`.
   No unsigned key substitution. A future key rotation needs a reviewed code
   change plus protected trust-registry update.
4. Merge after CI, allow the existing `deploy-d1-control-plane.yml` to
   apply D1 migration, deploy the Worker and set secrets. Confirm the deployed
   SHA and anonymous 401, research token 401, invalid policy 400,
   quota/idempotency behavior, expired/tampered GRO rejection and audit
   persistence. The website route must be separately published by Lovable
   and its source SHA verified; GitHub merge alone does not publish the site.
5. A real eligible GRO must first be created by existing attested rights,
   machine-facts, canonical signing and verified D1-hot publisher. Current
   valid GRO is mandatory. For corridor, build an authenticated
   independently verified corridor publication adapter; **do not copy**
   country GRO bytes into the corridor table or invent a signature.
6. Independently verify Predge signed market context against its own pinned
   public signing key, including `context_sha256`, numeric market ID,
   condition ID, dispute/UMA status and timestamps, before correlating it to
   any Geomacro GRO/Risk Gate result. Neither signed market state nor a
   public news item alone grants execution permission.

## Remaining acceptance: do not label this paid production GO

The following cannot be inferred from a green PR: the protected secrets were
updated, previously exposed token was revoked, real commercial GRO exists,
B2-backed D1 hot promotion completed, website route was republished, three
Predge live markets passed signed verification, or contracts/payment/revenue
shares were approved. Those require protected runtime/partner receipts.
`execution_authorized:false` remains the only permissible external state.

## Removed from this live path vs. still legacy code

`src/routes/api.risk-gate.ts` no longer calls
`risk-gate-commercial-boundary.server.ts`,
`risk-gate-idempotency.server.ts`, or
`risk-gate-api.server.ts`. Those historic modules may still be referenced
by tests or other older workflows and must be inventoried before deletion.
`src/routes/api.risk-gate-readiness.ts` also delegates to the public
D1 Worker readiness projection. A 200 means a correctly pinned, genuinely
signed **country** GRO and isolated credential were observed at check time;
`paid_launch_approved` remains false and corridor/partner signed-market,
payment and rights acceptance remain independent. These are **two**
D1-native production Risk Gate HTTP surfaces, not a repo-wide Supabase uninstall.
