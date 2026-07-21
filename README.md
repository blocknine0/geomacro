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
                          GitHub Actions, on independent staggered cron schedules
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

**Market automation.** Six independent GitHub Actions workflows run on their own schedules:

Every script that talks to Arc Testnet rotates across up to 5 configured RPC endpoints (falling back immediately to the next one on a rate-limit error rather than waiting out a shared, sustained cap) and batches per-market reads into a single Multicall3 call instead of one request per market, since a naive one-request-per-market pattern is what public/shared testnet RPC endpoints throttle hardest.

1. **Ingest** = pulls fresh news every ~2 hours, classifies, and inserts into Supabase.
2. **Create markets** = scans for high-severity events without a market and opens one on Arc via `createMarket()`, with a 46-hour staking window and 48-hour resolution window. Capped at 100 concurrently active (staking-open) markets — prioritizes severity 80-100 events first, falling back to the full 0-100 range only if that doesn't fill all available room, so a room slot never goes unused when high-severity news is scarce. Once at capacity, market creation pauses (news ingestion continues unaffected) until earlier markets close staking. A startup guard enforces `resolutionDuration > stakingDuration` so the AI verdict can never be revealed before staking closes.
3. **Resolve** = checks markets past their `resolution_at` time, asks Groq to judge HAWK vs DOVE based on how the situation has evolved, and calls `declareWinnerByAI()`. This sets a *tentative* winner and opens a 24-hour public dispute window; it is not final yet.
4. **Finalize** = checks markets whose dispute window has passed and calls `finalizeMarket()`, locking in the winner and making it claimable. This same step syncs each affected wallet's `positions` row (won → claimable, lost → history) and logs a `wallet_balance_history` event.
5. **Sync stakes** = every 30 minutes, replays onchain `Staked` events into Supabase so no stake is ever missing from a wallet's position history even if a client-side write drops.
6. **Sync lifecycle** = triggered once per hour by GitHub's scheduler (a far less contested schedule than a tight interval, since GitHub Actions' native cron can be delayed by hours during high load on frequently-scheduled workflows), then loops internally every 15 minutes for the rest of that hour using a plain shell `sleep` — once a job has actually started, that loop is 100% reliable with no scheduler uncertainty left. Each iteration reads every open market's on-chain status via a single batched Multicall3 call and writes it back as one of four stages (`active` / `awaiting_dispute` / `disputed` / `completed`) plus a dispute audit log, so the frontend's lifecycle tabs and the public `market_lookup` view never drift from chain state.

Two additional on-demand workflows (`auto-recovery.yml`, `debug-schema.yml`) let backfilling/re-syncing and schema-drift checks be triggered manually, and `security-monitor.yml` polls for on-chain anomalies every 15 minutes.

No human approval step in any of the automated ones. All Supabase writes from these workflows go through a service-role client, not the anon key, since the anon role only has read/insert grants on `events` and would otherwise silently drop update calls under RLS.

**Settlement.** `AgentArena.sol` holds staked USDC until a market finalizes, then pays out proportionally to whoever backed the winning side. Winners receive their original stake plus a proportional share of the losing pool, minus a 1.5% protocol fee.

**Portfolio.** Wallets authenticate via Sign-In With Ethereum (a gasless signed message, verified server-side into a short-lived session token) before any stake is recorded off-chain. Every position moves through a strict lifecycle in Supabase, protected by row-level security scoped to the signing wallet: `active` (staking open) → `pending_claim` (won, awaiting claim) or `lost` (moves to history) → `claimed`. The Portfolio page shows live wallet balance, a balance-history chart, and every position at its current stage, all sourced from real on-chain and Supabase state, never placeholders.

**Debate, not two monologues.** HAWK and DOVE are generated in a single Groq call, but the JSON schema forces HAWK's rationale to be written first and instructs DOVE to quote HAWK's specific claim and rebut it directly, exploiting the fact that structured generation is sequential. Genuinely adversarial without doubling the API cost or the rate-limit exposure of a true multi-turn call chain.

**Cross-checking.** Every market's Supabase event row, on-chain state, position/dispute counts, and `createMarket` transaction hash are joined into a single `market_lookup` SQL view, so verifying any market's full history is one query instead of jumping between Arcscan, the contract, and three tables.

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
| [Analytics](https://blocknine0.github.io/geomacro-analytics/) | Standalone dashboard: ingestion, market lifecycle and settlement health, live from the same Supabase project |

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

**Known issue (testnet, not mainnet-blocking):** the `DISPUTE_FEE`, `MIN_VOTE_AMOUNT`, and `MIN_VOLUME_FOR_DISPUTE` constants were originally written assuming 6-decimal precision (e.g. `50 * 10**6`), but since native values use 18 decimals, these currently resolve to near-zero amounts on-chain, the dispute/vote gating is not economically meaningful in the current testnet deployment. Since `constant`s are baked into bytecode at deploy time, fixing this requires a full redeploy (new contract address, no state migration), so it's deliberately deferred to the mainnet cutover rather than done mid-testnet. In the meantime, the 24-hour dispute window itself works correctly end to end, every market is classified into one of four lifecycle stages (`active` → `awaiting_dispute` → `disputed` / `completed`), synced from on-chain state into Supabase on a staggered ~2-hour cycle and surfaced as distinct tabs in the Analyst Panel, so disputed markets stay visibly isolated from the rest even though the fee gating is still testnet-scale.

**One honest tradeoff worth calling out:** resolution uses a Groq call (`llama-3.1-8b-instant`, with a Cerebras `llama3.1-8b` fallback if Groq's daily quota is exhausted) to judge how the original story has evolved 48 hours later, cross-checked against fresh news search results. This is more informative than a raw severity comparison but still relies on an LLM judgment rather than a dispute-based oracle like UMA. The contract does have an on-chain dispute/vote mechanism as a backstop (see above), but the constant-scaling bug currently limits its practical use on testnet. To reduce single-call flakiness on close calls, the resolver now re-checks itself with a second independent read whenever the first verdict is low-confidence or a draw, and defaults to a draw rather than a shaky verdict if the two disagree. Fully decentralizing resolution remains on the roadmap.

### Test coverage

The contract has a Foundry test suite covering market creation, a set of adversarial staking/misuse attempts (non-owner market creation, zero-value stakes, staking on a nonexistent market, staking after the window closes, resolving early), and the full settlement and payout path with the exact expected numbers checked against the contract's actual fee/split math.

```
Ran 4 tests for test/AgentArena.t.sol:AgentArenaTest
[PASS] testAdversarialStaking() (gas: 230309)
[PASS] testMarketCreation() (gas: 123301)
[PASS] testSettlementAndPayout() (gas: 395956)
[PASS] test_RevertWhen_DuplicateMarketCreated() (gas: 125155)
Suite result: ok. 4 passed; 0 failed; 0 skipped
```

Run it yourself:

```bash
forge install foundry-rs/forge-std
forge test -vv
```

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
contracts/
  AgentArena.sol                   Market creation, staking, AI resolution, dispute/vote, claim
test/
  AgentArena.t.sol                 Foundry test suite: creation, adversarial staking, full settlement/payout
foundry.toml                       Foundry config (src = contracts/, test = test/)
scripts/
  ingest-news.js                  Pulls NewsAPI/Guardian articles, classifies with Groq, inserts to Supabase
  create-markets.js               Scans for high-severity events, opens markets on Arc (capped at 100 concurrently active)
  resolve-markets.js              Checks due markets, Groq judges HAWK/DOVE, calls declareWinnerByAI(), repairs orphaned Supabase flags
  finalize-markets.js             Checks AI-resolved markets past the dispute window, calls finalizeMarket(), syncs positions
  sync-stakes.js                  Replays onchain Staked events into Supabase (scheduled every 30 min)
  sync-lifecycle.js               Syncs each market's on-chain status into events.lifecycle_stage + market_disputes audit log
  backfill-positions.js           One-off repair: syncs positions for markets already finalized on-chain but not yet reflected in Supabase
  backfill-tx-hashes.js           One-off repair: backfills historical createMarket tx hashes from on-chain MarketCreated logs
  anomaly-monitor.js               Polls for on-chain anomalies
  debug-schema.js                  Verifies live Supabase schema matches what each script expects
.github/workflows/
  auto-ingest-news.yml            Runs ingest-news.js every ~2 hours
  auto-create-markets.yml         Runs create-markets.js on its own ~2-hour schedule
  auto-resolve-markets.yml        Runs resolve-markets.js on its own ~2-hour schedule
  auto-finalize-markets.yml       Runs finalize-markets.js every ~2 hours
  sync-stakes.yml                 Runs sync-stakes.js every 30 minutes
  sync-lifecycle.yml              Runs sync-lifecycle.js hourly, looping internally every 15 min via shell sleep (avoids GitHub's native-cron delay risk on tight schedules)
  auto-recovery.yml               Manual-trigger sync-stakes / resolve-markets / create-markets
  security-monitor.yml            Anomaly monitor, every 15 minutes
  debug-schema.yml                Manual-trigger schema drift check
```

**Supabase, beyond the `events` table:** `positions` (per-wallet stake/claim state, RLS-scoped), `wallet_balance_history` (append-only ledger), `market_disputes` (audit log of every on-chain dispute), and a `market_lookup` view joining all of the above by market ID for one-query cross-checking.

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
- [x] Four-stage market lifecycle (Active / Awaiting Dispute / Disputed / Completed) synced from chain to Supabase via a batched Multicall3 read, hourly-triggered with an internal 15-minute self-loop, surfaced as distinct tabs
- [x] `market_lookup` cross-check view + historical `createMarket` tx-hash backfill for every market
- [x] Sequential-rebuttal HAWK/DOVE debate (DOVE must quote and directly counter HAWK's specific claim, same API call)
- [x] Self-consistency re-check on low-confidence/draw verdicts before a market settles
- [x] Service-role hardening across every Supabase-writing script (anon role has no UPDATE grant on `events`, was silently dropping writes)
- [x] Standalone public analytics dashboard (pipeline + automation health, zero fabricated numbers)
- [x] Foundry test suite for the contract (market creation, adversarial staking attempts, full settlement/payout math)
- [ ] On-chain dispute fee/threshold decimal fix (`10**6` → `10**18`), deferred to the mainnet redeploy since `constant`s can't be patched in place
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
