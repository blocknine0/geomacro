# Geomacro Testnet Tester deployment configuration

The Testnet Tester Program must remain disabled until the required server-only configuration, migrations and acceptance tests are complete.

## Server-only environment

Required before end-to-end activation:

- `PUBLIC_SITE_URL=https://geomacro.live`
- `RESEND_API_KEY`
- `TESTNET_EMAIL_FROM`
- `TESTNET_USDC_RECEIVER_ADDRESS` (public EVM receiving address only, never a private key)
- `TESTNET_OAUTH_COOKIE_SECRET` (at least 32 random bytes, server-only)
- `X_OAUTH_CLIENT_ID`
- `X_OAUTH_CLIENT_SECRET` only if the configured X application is a confidential client
- `DISCORD_OAUTH_CLIENT_ID`
- `DISCORD_OAUTH_CLIENT_SECRET`
- the supported per-chain Testnet RPC variables consumed by `testnet-usdc-payment-verification.server.ts`

No value above may use a `VITE_` prefix.

## OAuth callback URLs

Configure exact callback URLs in the provider dashboards:

- X: `https://geomacro.live/api/testnet-tester/oauth/x/callback`
- Discord: `https://geomacro.live/api/testnet-tester/oauth/discord/callback`

X uses OAuth 2.0 Authorization Code with PKCE (`S256`) and requests only `users.read`. Discord requests only `identify`. Provider access tokens are used transiently to obtain the provider account ID and are not persisted by Geomacro.

## Session and identity boundary

Browser tester sessions use a Secure, HttpOnly, SameSite=Lax `__Host-` cookie. Programmatic clients may continue to use the bearer-session path where explicitly needed. Email, wallet, X and Discord identities are stored as SHA-256 references in the private tester profile tables. Raw OAuth tokens, wallet signatures, wallet private keys and seed phrases are not persisted.

## Testnet USDC activation

The receiving wallet configuration is a public address. Geomacro does not need, request or store the receiving wallet private key. The activation server verifies the supported chain ID, configured USDC contract, transaction receipt, transfer event, registered payer wallet, configured receiver and minimum transfer amount before granting the canonical 30-day Testnet Tester entitlement.

Testnet payments are always `testnet_non_revenue` and must never be counted as commercial revenue.

## Pre-live gate

Before the public page is enabled for testers, complete at minimum:

1. Apply pending production schema migrations through the protected database workflow after reviewing the dry-run plan.
2. Configure provider callbacks and server-only secrets.
3. Verify email registration, wallet challenge replay rejection, X and Discord OAuth state/PKCE handling, payment verification on every supported chain, entitlement expiry, API-key issue/list/revoke, credit exhaustion and exact-retry idempotency.
4. Run negative tests for wrong chain, wrong token, wrong receiver, underpayment, failed transaction, stale/replayed proof, duplicate payment claim, expired session, OAuth denial/state mismatch and revoked API key.
5. Run security, resilience and load tests and retain evidence before live launch.
6. Confirm customer-facing output and social cards contain no upstream news-source identity.

`execution_authorized` remains false throughout the tester program.
