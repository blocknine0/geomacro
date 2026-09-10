# Geomacro Arc Testnet Tester Growth v1

Status: implementation contract for the Arc Testnet testing program.

## Objective

Create a controlled testing program that gives verified Arc Testnet users enough free quota and structured data to experience the real Geomacro product, while keeping the commercial paid product differentiated.

This is a testing and growth surface, not commercial revenue.

## Registration gate

A user receives Arc Testnet tester quota only after all required registration steps are complete:

1. email account created and email verified;
2. Arc Testnet wallet connected and ownership verified by signed nonce;
3. X account connected through OAuth;
4. Discord account connected through OAuth;
5. profile name supplied;
6. profile image optionally uploaded through the controlled profile-image storage path;
7. tester terms/version accepted.

The profile image is optional. Email, wallet, X, Discord and profile name are required for the initial closed testing program.

No wallet seed phrase or private key is ever requested or stored.

## Tester entitlement

Canonical offer: `arc_testnet_tester_30d`

Recommended initial allocation: 250 test credits per 30 days per verified tester identity.

Identity is bound to one canonical tester account using verified email, verified Arc Testnet wallet, X account and Discord account. Duplicate-account and quota-abuse controls must fail closed.

The tester quota is:
- free;
- non-transferable;
- non-redeemable;
- not money or stored value;
- not commercial revenue;
- Testnet-only.

## Structured data access

Arc Testnet testers may receive bounded governed structural intelligence so the program demonstrates the real product rather than a superficial demo.

Initial testing capabilities:
- `intelligence_query`;
- `gri_read`;
- `structural_country_digest`;
- `structural_corridor_digest`;
- limited `structural_country_profile`;
- limited `structural_corridor_profile`;
- limited signed Risk Object testing;
- limited Risk Gate testing.

Tester output limits remain lower than the paid API tier. The centralized entitlement registry owns the exact server-side limits.

`execution_authorized=false` is permanent.

## No upstream news-source disclosure

No user-facing Arc Testnet output, API response, social card, profile surface or public proof may expose upstream news publisher/source identity, publisher domain, source URL or internal news-source ID.

Internally required provenance may remain in protected systems for audit/legal/quality operations, but customer/tester output uses only safe Geomacro evidence summaries, hashes, methodology/integrity fields and source-agnostic evidence counts where appropriate.

## Quota behavior

Every test request is metered centrally.

When quota remains, the request consumes the configured test-credit cost.

When quota is exhausted, fail with `TEST_QUOTA_EXHAUSTED` and return non-sensitive upgrade actions:
- request additional Testnet credits where manually approved;
- wait for the next quota period;
- move to a commercial plan when the use case is no longer testing.

Retries use the existing idempotency contract and cannot double-charge quota.

## Social card growth loop

Every eligible intelligence output should expose a `Share result` action.

The share card is a Geomacro-branded 1200x630 social image with:
- Geomacro logo in the upper-left;
- `ARC TESTNET · TESTING` badge in the upper-right;
- short subject/title;
- primary risk state/score where methodology permits;
- quantified change/direction where available;
- one short Geomacro-generated reason line;
- confidence/freshness or verification state;
- optional country/corridor label;
- short CTA: `Explore the risk intelligence`;
- `geomacro.live` footer;
- no upstream publisher/source identity;
- no raw evidence text that violates delivery rights;
- no wallet/email/X/Discord identity unless the user explicitly chooses to display their public profile name.

Supported sharing targets:
- X;
- LinkedIn;
- Reddit;
- WhatsApp;
- Telegram;
- copy link/download image where the browser supports it.

Each shared result uses a public share page with Open Graph/Twitter metadata so the same output can be used in demos, partner calls, ecosystem showcases and tester posts.

## Demo reuse

The exact same Arc Testnet tester API and share-card path is the official reusable demo surface. Do not build a fake parallel demo data path.

Demo mode should use real governed Testnet-entitled outputs, explicit Testnet labels and the same structured response contract used by testers.

## Internal telemetry

Every tester request is recorded in the centralized commercial operations ledger with:
- tester principal ID;
- access surface = `arc_testnet_tester`;
- entitlement/offer;
- capability;
- country/corridor subject;
- credits charged/remaining;
- success/failure;
- latency;
- response hash and response size;
- structural observation/evidence/history counts;
- Risk Object/Risk Gate flags;
- share-card creation/share events where recorded.

No raw email address, raw wallet address, X token, Discord token, OAuth token, profile-image secret URL, private key or upstream news-source identity belongs in public proof output.

## Public proof

Owner operations may aggregate Arc Testnet testing into redacted proof such as:
- verified tester count;
- active tester count;
- risk requests delivered;
- country/corridor analyses;
- structural observations delivered;
- signed Risk Objects delivered;
- Risk Gate evaluations;
- share cards created;
- share actions;
- success rate and latency.

Individual identities remain private by default.

## Security requirements

- verified email before quota activation;
- nonce-based wallet signature verification with expiry and one-time use;
- OAuth state + PKCE where provider flow supports it;
- provider access/refresh tokens encrypted or avoided entirely when only identity proof is needed;
- never expose OAuth client secrets to browser code;
- avatar upload MIME/type/size validation and server-generated storage path;
- one canonical tester profile per verified wallet/X/Discord identity unless owner override is recorded;
- rate limiting before expensive intelligence generation;
- abuse suspension and entitlement revocation support;
- no production/Mainnet execution permission.
