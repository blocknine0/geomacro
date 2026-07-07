# Geomacro

### Financializing global risk narratives. Onchain, in USDC, on Arc.

[![Live App](https://img.shields.io/badge/Live-geomacro.live-FF6B00?style=for-the-badge)](https://geomacro.live)
[![Arc Testnet](https://img.shields.io/badge/Arc-Testnet-1E90FF?style=for-the-badge)](https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe)
[![Contract Verified](https://img.shields.io/badge/Contract-Verified-success?style=for-the-badge)](https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe)
[![X](https://img.shields.io/badge/X-@GeomacroLive-000000?style=for-the-badge&logo=x)](https://x.com/GeomacroLive)

**[geomacro.live](https://geomacro.live)**

---

Geomacro is a real-time intelligence terminal and prediction market across the four pillars that move global risk: **geopolitics, rare earth supply, macroeconomics and crypto liquidity.**

Every breaking headline becomes a tradable 46-hour contract on Arc. An LLM scores each event for severity. The USDC staked on each side (HAWK vs DOVE) becomes the live implied probability of escalation. Settle onchain, no custodian, no middleman.

---

## What this is

Most prediction markets wait for humans to notice the news. Here, markets open themselves. An LLM scores every breaking story and anyone can stake real USDC on whether the risk it describes will escalate (HAWK) or de-escalate (DOVE). Everything settles onchain in USDC on Arc. No custodian, no middleman.

We built Geomacro because the gap between "news breaks" and "market opens" is where the real signal lives. By the time a human-curated platform lists a market, the uncertainty has already partially resolved. Geomacro closes that gap.

**Non-custodial by design.** The app never requests, transmits, or stores a private key or seed phrase, at any point, in any flow. Wallet interactions (sign-in, stake, claim) all happen client-side via the wallet extension, which handles signing locally. The backend only ever sees a public wallet address.

---

## How it fits together

```
NewsAPI / Guardian  →  Groq (llama-3.1-8b-instant)  →  Supabase  →  Live Feed
                                              │
                                              ▼
                          GitHub Actions, on independent ~2h cron schedules
              (ingest → create markets → resolve via AI → finalize)
                                              │
                                              ▼
                            AgentArena.sol on Arc Testnet
        createMarket → stake → declareWinnerByAI → (optional dispute/vote) → finalizeMarket → claim
                                              │
                                              ▼
                    Supabase (positions + wallet_balance_history, RLS-protected)
                              → Portfolio page (SIWE-authenticated)
```

**Ingestion.** NewsAPI (falling back to The Guardian on rate limits) pulls fresh articles across four categories: geopolitics, macro, rare-earth/commodities and crypto. Off-topic articles are rejected before they reach the feed via an LLM relevance gate, not just keyword filtering.

**Classification.** Groq (`llama-3.1-8b-instant`) scores each article for severity (0-100), confidence (0-100), and generates a short narrative + summary, all stored directly on the event row. Each event's "Risk Δ" is computed deterministically from a rolling 24-hour category baseline, not guessed by the model.

**Storage.** Supabase holds the event log (`events` table). The frontend reads straight from it, with Realtime subscriptions for instant updates.

**Market automation.** Four independent GitHub Actions workflows run on a schedule:
1. **Ingest** = pulls fresh news every ~2 hours, classifies, and inserts into Supabase.
2. **Create markets** = scans for high-severity events (severity ≥ 40) without a market and opens one on Arc via `createMarket()`, with a 46-hour staking window and 48-hour resolution window. A startup guard enforces `resolutionDuration > stakingDuration` so the AI verdict can never be revealed before staking closes.
3. **Resolve** = checks markets past their `resolution_at` time, asks Groq to judge HAWK vs DOVE based on how the situation has evolved, and calls `declareWinnerByAI()`. This sets a *tentative* winner and opens a 24-hour public dispute window; it is not final yet.
4. **Finalize** = checks markets whose dispute window has passed and calls `finalizeMarket()`, locking in the winner and making it claimable. This same step syncs each affected wallet's `positions` row (won → claimable, lost → history) and logs a `wallet_balance_history` event.

Two additional on-demand workflows (`auto-recovery.yml`, `sync-stakes.yml`) let backfilling/re-syncing be triggered manually if a run is ever missed, and `security-monitor.yml` polls for on-chain anomalies every 15 minutes.

No human approval step in any of the automated ones.

**Settlement.** `AgentArena.sol` holds staked USDC until a market finalizes, then pays out proportionally to whoever backed the winning side. Winners receive their original stake plus a proportional share of the losing pool, minus a 1.5% protocol fee.

**Portfolio.** Wallets authenticate via Sign-In With Ethereum (a gasless signed message, verified server-side into a short-lived session token) before any stake is recorded off-chain. Every position moves through a strict lifecycle in Supabase, protected by row-level security scoped to the signing wallet: `active` (staking open) → `pending_claim` (won, awaiting claim) or `lost` (moves to history) → `claimed`. The Portfolio page shows live wallet balance, a balance-history chart, and every position at its current stage, all sourced from real on-chain and Supabase state, never placeholders.

---

## Live terminal

| Page | What it shows |
|------|--------------|
| [Active Narratives](https://geomacro.live/feed) | Live feed of AI-classified events with severity and Risk Δ scores |
| [Analyst Panel](https://geomacro.live/arena) | HAWK vs DOVE staking interface with live lifecycle state (Staking Open → Closed → Tentative → Finalized) |
| [Data Pipeline](https://geomacro.live/pipeline) | Ingestion and classification pipeline status, stage by stage |
| [Onchain](https://geomacro.live/onchain) | On-chain market data and contract activity |
| [Portfolio](https://geomacro.live/portfolio) | SIWE-authenticated wallet balance, position lifecycle and claim history |
| [Docs](https://geomacro.live/docs) | Full technical documentation, architecture and API playground |
| [Roadmap](https://geomacro.live/roadmap) | What's shipped and what's next |

---

## The contract

Kept intentionally small: no governance token, no oracle network, no multisig. Enough to prove the settlement loop works end to end, with a built-in optimistic-dispute layer for community pushback on the AI's tentative verdict.

```solidity
createMarket(marketId, stakingDuration, resolutionDuration)  // owner opens a market
stake(marketId, side) payable                                // anyone backs HAWK or DOVE with USDC
declareWinnerByAI(marketId, winningSide)                     // automated resolver sets a tentative winner
disputeMarket(marketId) payable                               // anyone can challenge the tentative winner (fee-gated)
voteOnDispute(marketId, side) payable                         // community votes if a dispute is raised
finalizeMarket(marketId)                                      // locks in the final winner after the dispute window
claim(marketId)                                                // winners withdraw their share
```

**Contract:** `0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe` on Arc Testnet
**[View on Arcscan →](https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe)**

USDC is Arc's native gas token, so staking is just a payable call, no `approve()` step, no ERC-20 friction. Native-currency values on Arc use **18 decimals** (not 6, despite USDC's ERC-20 interface using 6), this matters for anyone integrating directly with the contract's `payable` functions.

**Known issue (testnet, not yet mainnet-blocking):** the `DISPUTE_FEE`, `MIN_VOTE_AMOUNT`, and `MIN_VOLUME_FOR_DISPUTE` constants were originally written assuming 6-decimal precision (e.g. `50 * 10**6`), but since native values use 18 decimals, these currently resolve to near-zero amounts on-chain, the dispute/vote gating is not economically meaningful in the current testnet deployment. A corrected version (`10**18` scale) is ready and will ship with the next redeploy (planned alongside mainnet).

**One honest tradeoff worth calling out:** resolution uses a single Groq call (`groq/compound`, which has built-in web search) to judge how the original story has evolved 48 hours later. This is more informative than a raw severity comparison but still relies on an LLM judgment rather than a dispute-based oracle like UMA. The contract does have an on-chain dispute/vote mechanism as a backstop (see above), but the constant-scaling bug currently limits its practical use on testnet. Fully decentralizing resolution remains on the roadmap.

---

## Repo layout

```
src/
  routes/                         Feed, Analyst Panel, Portfolio, Docs, Pipeline, Onchain, Roadmap
  components/sections/            Page-level UI sections
  lib/
    agent-arena.ts                 Contract ABI, reads/writes, wei/USDC conversion
    siwe.functions.ts               Sign-In With Ethereum verification + session JWT
    positions.functions.ts          Records stakes/claims into Supabase (JWT-scoped, RLS-protected)
    live-feed.functions.ts          Live event fetch + deterministic Risk Δ baseline calc
    arena-judge.functions.ts        Main-agent settlement verdict
    agents.functions.ts             HAWK/DOVE analyst duel generation
  hooks/use-wallet.ts               Wallet connect + SIWE session state
AgentArena.sol                     Market creation, staking, AI resolution, dispute/vote, claim
scripts/
  ingest-news.js                  Pulls NewsAPI/Guardian articles, classifies with Groq, inserts to Supabase
  create-markets.js               Scans for high-severity events, opens markets on Arc
  resolve-markets.js              Checks due markets, Groq judges HAWK/DOVE, calls declareWinnerByAI()
  finalize-markets.js             Checks AI-resolved markets past the dispute window, calls finalizeMarket(), syncs positions
  sync-stakes.js                  Manual backfill for missed stake events
  anomaly-monitor.js               Polls for on-chain anomalies
  debug-schema.js                  Verifies live Supabase schema matches what each script expects
.github/workflows/
  auto-ingest-news.yml            Runs ingest-news.js every ~2 hours
  auto-create-markets.yml         Runs create-markets.js on its own ~2-hour schedule
  auto-resolve-markets.yml        Runs resolve-markets.js on its own ~2-hour schedule
  auto-finalize-markets.yml       Runs finalize-markets.js every ~2 hours
  auto-recovery.yml               Manual-trigger sync-stakes / resolve-markets / create-markets
  security-monitor.yml            Anomaly monitor, every 15 minutes
  debug-schema.yml                Manual-trigger schema drift check
```

---

## Roadmap

- [x] Live feed pipeline with relevance-gated classification across 4 categories
- [x] Smart contract deployed and verified on Arc Testnet
- [x] Full create, stake, resolve and claim cycle tested onchain
- [x] Automated market creation from live events via GitHub Actions
- [x] Automated tentative resolution via Groq after the 48-hour window
- [x] Automated finalization after the 24-hour public dispute window
- [x] Dynamic Arena with no hardcoded markets, pure on-chain discovery
- [x] Supabase schema-drift checker to catch backend/script mismatches early
- [x] Deterministic Risk Δ (24h category baseline, not LLM-guessed)
- [x] SIWE-authenticated Portfolio with full position lifecycle and RLS
- [x] Startup guard preventing verdict reveal before staking closes
- [ ] On-chain dispute fee/threshold decimal fix (`10**6` → `10**18`), ready, pending redeploy
- [ ] Fully decentralized dispute-based resolution as the primary mechanism (currently AI-first with an on-chain dispute backstop)
- [ ] Mainnet deployment
- [ ] Public track record showing how often HAWK vs. DOVE actually calls it right
- [ ] Full mobile wallet support via WalletConnect for external browsers
- [ ] Implement multi-currency asset support (stablecoins/native tokens) for deposits and withdrawals
- [ ] Integrate privacy-preserving KYC layers to mitigate money laundering and malicious protocol exploits
- [ ] Architect a comprehensive regulatory compliance framework for decentralized prediction markets

---

## Why Arc

Risk markets like this live or die on settlement cost and speed. Arc's native USDC gas means every stake, claim and market creation is just one cheap, stablecoin-denominated transaction. No bridging, no wrapped tokens, no separate gas token to keep topped up. That is basically the whole bet here. The chain should stay out of the way of the prediction, not add friction on top of it.

---

Built by [@blocknine0](https://github.com/blocknine0) · Follow on X: [@GeomacroLive](https://x.com/GeomacroLive) · Questions or bugs? [Open an issue](https://github.com/blocknine0/geomacro/issues)
