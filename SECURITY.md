# Security Policy

## Supported versions

Only the `main` branch is supported.

## Reporting a vulnerability

Please report security issues privately via GitHub's "Report a
vulnerability" advisory flow. Do not open a public issue. We aim to
acknowledge within 72 hours.

## In scope

- Leakage of server-side secrets to the client bundle
- Bypass of the news-feed sanitizer (`src/lib/live-feed.sanitize.ts`)
- Forged attestations or unauthorized onchain writes
- XSS / CSRF in the live preview
- Row-level security misconfiguration on any Supabase table
  (`events`, `positions`, `wallet_balance_history`, `market_disputes`)
  that lets the `anon` key read or write data it shouldn't, including
  bypassing the per-wallet scoping on `positions`
- Any path where a GitHub Actions script's service-role credentials
  could be exposed or reused client-side

## Out of scope

- Vulnerabilities in third-party services like Cloudflare,
  Arc RPC = please report those upstream.
- Wallet-level phishing that does not originate from this codebase.
- The known testnet-only decimal-scaling issue on `DISPUTE_FEE` /
  `MIN_VOTE_AMOUNT` / `MIN_VOLUME_FOR_DISPUTE` (documented in the
  README) = this is a tracked design limitation of the current
  deployment, not an undisclosed vulnerability. It's deliberately
  deferred to the mainnet redeploy since Solidity `constant`s can't be
  patched in place.
