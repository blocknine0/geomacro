# Geomacro

### Onchain geopolitical risk intelligence, settled in USDC, on Arc.

[![Live App](https://img.shields.io/badge/Live-geomacro.live-FF6B00?style=for-the-badge)](https://www.geomacro.live)
[![Arc Testnet](https://img.shields.io/badge/Arc-Testnet-1E90FF?style=for-the-badge)](https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe)
[![Contract Verified](https://img.shields.io/badge/Contract-Verified-success?style=for-the-badge)](https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

**[www.geomacro.live](https://www.geomacro.live)**

---

Geomacro reads the news, scores the risk, and lets two AI agents argue about what happens next. Agent Hawk bets on escalation. Agent Dove bets on calm. Every market opens automatically from live news, settles in USDC on Arc, and resolves in 48 hours.

> **Live site:** <https://www.geomacro.live> · **Contract:** [`0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe`](https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe) on Arc Testnet

---

## Table of contents

- [What this is](#what-this-is)
- [Architecture](#architecture)
- [End-to-end market flow](#end-to-end-market-flow)
- [Lifecycle stages](#lifecycle-stages)
- [Contract state machine](#contract-state-machine)
- [The contract](#the-contract)
- [Cross-chain bridge (CCTP V2)](#cross-chain-bridge-cctp-v2)
- [RPC resilience](#rpc-resilience)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Local setup](#local-setup)
- [Configuration reference](#configuration-reference)
- [Product surfaces](#product-surfaces)
- [Design principles](#design-principles)
- [Roadmap](#roadmap)
- [Why Arc](#why-arc)

---

## What this is

Most prediction markets wait for humans to notice the news. Here, markets open themselves. An LLM scores every breaking story, two AI agents argue opposite outcomes, and anyone can stake real USDC on who is right. Everything settles onchain in USDC on Arc. No custodian, no middleman.

I built Geomacro because the gap between "news breaks" and "market opens" is where the real signal lives. By the time a human-curated platform lists a market, the uncertainty has already partially resolved. Geomacro closes that gap.

---

## Architecture

Three independent pieces, each doing one job:

```mermaid
flowchart LR
    subgraph ingestion[Ingestion]
        NA[NewsAPI]
        GD[The Guardian]
        GR[Groq / Cerebras<br/>classify + score]
    end

    subgraph automation[GitHub Actions — scheduled]
        ING[ingest-news.js]
        CRE[create-markets.js]
        RES[resolve-markets.js]
        FIN[finalize-markets.js]
        SYNC[sync-lifecycle.js<br/>self-looping, 15 min]
        MON[anomaly-monitor.js<br/>WARN / CRITICAL alerts]
    end

    subgraph data[Supabase]
        DB[(events table)]
    end

    subgraph client[Frontend — Vite + TanStack Start]
        FEED[Live Feed]
        ARENA[Agent Arena]
        BRIDGE[Bridge]
        PORT[Portfolio — SIWE auth]
    end

    subgraph rpc[RpcManager]
        RM[5 rotating endpoints<br/>+ Multicall3 batching]
    end

    subgraph chain[Arc Testnet]
        CT[AgentArena.sol]
        USDC[Native USDC]
    end

    NA --> GR --> ING
    GD --> GR
    ING --> DB
    DB --> FEED
    CRE -->|scans high-severity events| DB
    CRE -->|createMarket| CT
    RES -->|resolves at 48h| CT
    FIN -->|finalizes past dispute window| CT
    SYNC -->|polls + advances lifecycle_stage| CT
    MON -->|watches all workflows| DB
    ARENA -->|reads live state via| RM
    RM --> CT
    FEED --> ARENA
    BRIDGE -->|CCTP V2| USDC
    PORT -->|reads positions via| RM
    USDC --> CT
```

- **Ingestion tier** — NewsAPI and The Guardian fan-out across four categories, classified and severity-scored by Groq, with a Cerebras fallback on quota exhaustion.
- **Automation tier (GitHub Actions)** — six scheduled, unattended jobs covering the full market lifecycle: ingest, create, resolve, finalize, a self-looping 15-minute lifecycle sync, and a two-tier (WARN/CRITICAL) anomaly monitor watching the rest. No human approval step in any of them.
- **Client tier (Vite + TanStack Start)** — reads live contract state directly for market discovery, through `RpcManager`, so no hardcoded market list and no single-RPC point of failure.
- **Settlement tier (Arc Testnet)** — `AgentArena.sol` holds staked USDC and pays out after the dispute window closes.

---

## End-to-end market flow

```mermaid
flowchart LR
    A[News breaks] --> B[Groq classifies<br/>severity + relevance]
    B --> C{High severity<br/>and no market yet?}
    C -->|yes| D[createMarket on Arc]
    D --> E[Users stake USDC<br/>on Hawk or Dove]
    E --> E2[Staking closes at 46h]
    E2 --> F[48h resolution point]
    F --> G[Groq re-reads the story,<br/>judges which side aged better]
    G --> H[declareWinner on Arc<br/>status: AI_RESOLVED]
    H --> J[24-48h dispute window]
    J --> K[finalize-markets.js<br/>closes the window]
    K --> I[Winners claim proportional payout]
```

`sync-lifecycle.js` runs every 15 minutes in the background and keeps every market's `lifecycle_stage` in sync with however far along the clock actually is, independent of whether the other jobs fired on schedule.

The primitive stays small on purpose: one story, one market, two sides, with a real dispute window instead of an instant, unchallengeable verdict.

---

## Lifecycle stages

Resolution isn't a single instant flip from staking to payout. Every market moves through four `lifecycle_stage` values, each mapped to a fixed point on the clock:

| Hours | `lifecycle_stage` | What's happening |
|---|---|---|
| 0 – 46h | `active` | Staking open on Hawk or Dove |
| 46 – 48h | `active` (locked) | Resolution buffer — staking locked, no new positions, resolver hasn't run yet |
| 48h | → `awaiting_dispute` | Groq resolves and posts a verdict (`AI_RESOLVED`) |
| 48 – 72h | `awaiting_dispute` → `disputed` | Dispute window: 24h if the verdict goes unchallenged, extends to 48h total if disputed |
| 72h | `completed` | `finalize-markets.js` closes the window, `claim()` opens |

```mermaid
stateDiagram-v2
    [*] --> active: createMarket
    active --> active: stake(side) [0–46h]
    active --> awaiting_dispute: declareWinner at 48h<br/>(status: AI_RESOLVED)
    awaiting_dispute --> disputed: challenge raised<br/>within 24h window
    awaiting_dispute --> completed: 24h passes,<br/>no dispute raised
    disputed --> completed: 48h total dispute<br/>window closes
    completed --> [*]: claim() per winner
```

`sync-lifecycle.js` is what actually advances `lifecycle_stage` on its own 15-minute loop — it doesn't wait on the other scheduled jobs, so a market's displayed stage stays accurate even if `resolve-markets.js` or `finalize-markets.js` runs a few minutes late.

---

## Contract state machine

The on-chain function calls that drive the lifecycle above:

```mermaid
stateDiagram-v2
    [*] --> Created: createMarket
    Created --> Staked: stake(side)
    Staked --> Resolved: declareWinner<br/>(AI_RESOLVED)
    Resolved --> Disputed: challenge<br/>(within 24h)
    Resolved --> Finalized: finalize<br/>(24h, undisputed)
    Disputed --> Finalized: finalize<br/>(48h dispute window closes)
    Finalized --> Claimed: claim() per winner
    Claimed --> [*]

    note right of Staked
      Staking open 0–46h.
      Locked 46–48h before resolution.
    end note
    note right of Resolved
      lifecycle_stage: awaiting_dispute
    end note
    note right of Finalized
      lifecycle_stage: completed
    end note
```

---

## The contract

Kept this intentionally small. No governance token, no oracle network, no multisig. Just enough to prove the settlement loop actually works end to end before adding more moving parts.

```solidity
createMarket(marketId)          // owner opens a market
stake(marketId, side) payable   // anyone backs HAWK or DOVE with USDC
declareWinner(marketId, side)   // automated resolver posts the AI verdict
// dispute + finalize entry points sit on top of this base loop —
// see Lifecycle stages above for the 24h/48h dispute-window timing
claim(marketId)                 // winners withdraw their share
```

USDC is Arc's native gas token, so staking is just a payable call. No approve step, no ERC-20 friction.

**One honest tradeoff worth calling out:** resolution right now uses Groq to re-read the original story 48 hours later and judge which call aged better. This is more informative than a raw severity comparison but still relies on an LLM judgment rather than a dispute-based mechanism like UMA. Decentralizing resolution is the obvious next step and it is on the roadmap below.

---

## Cross-chain bridge (CCTP V2)

`/bridge` moves USDC into Arc Testnet from other CCTP V2 testnets without a custodian in the middle. It runs entirely in the browser through the connected wallet.

```mermaid
sequenceDiagram
    actor User
    participant Wallet as Browser wallet
    participant Source as Source chain<br/>(Eth / Base / Avalanche Sepolia)
    participant Iris as Circle Iris API
    participant Arc as Arc Testnet

    User->>Wallet: select source chain + amount
    Wallet->>Source: approve USDC for TokenMessenger
    User->>Wallet: burn for Arc
    Wallet->>Source: depositForBurn(...)
    Source-->>Wallet: tx receipt

    loop poll until attested
        Wallet->>Iris: GET message status
        Iris-->>Wallet: pending / complete
    end

    User->>Wallet: mint on Arc
    Wallet->>Arc: receiveMessage(message, attestation)
    Arc-->>User: USDC credited
```

- Source testnets: Ethereum Sepolia, Base Sepolia, Avalanche Fuji.
- Uses CCTP V2's Fast Transfer path, so the deposit settles far faster than a standard burn-and-mint bridge.
- The mint step on Arc is permissionless — the user's own wallet submits it, no backend signer required.
- Read-path RPC calls (balance checks, market discovery) go through `RpcManager` (see below), so a single rate-limited endpoint doesn't break the UI.

---

## RPC resilience

Every read against Arc — balances, market state, portfolio positions — goes through a single `RpcManager` rather than a hardcoded endpoint.

- **5 rotating endpoints**: Alchemy, QuickNode, GetBlock, dRPC, and a public fallback. If one is rate-limited, slow, or down, the manager rotates to the next without the user noticing.
- **Multicall3 batching**: instead of firing N separate `eth_call`s for N markets, reads are batched into a single Multicall3 call, cutting both request count and the chance of a partial-data UI state if one call in the batch fails.

This is a genuinely reusable primitive independent of anything specific to Geomacro's market logic — it's the kind of infrastructure most Arc-Testnet frontends end up needing and few actually ship with this level of resilience.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite 7 + TanStack Start + React 19 + Tailwind v4 | Fast dev loop, file-based routing, streaming-friendly SSR |
| UI components | shadcn/ui + Radix primitives | Accessible defaults, no framework lock-in |
| Chain client | ethers v6 + `RpcManager` (5 endpoints, Multicall3) | Read/write against Arc Testnet with real RPC-level redundancy, not just a two-URL fallback |
| Data | Supabase (Postgres) | Event log for the Live Feed; frontend reads straight from it |
| Classification | Groq (`llama-3.3-70b-versatile`), falling back to `llama-3.1-8b-instant` on quota exhaustion, then Cerebras | Fast, cheap inference for severity scoring and resolution judgment, with a two-tier fallback so quota limits don't stall the pipeline |
| News sources | NewsAPI.org + The Guardian | Two-source article fan-out across four categories, reduces single-source blind spots |
| Validation | Zod | Schema validation on classified events before they hit Supabase |
| Auth | Sign-In with Ethereum (SIWE) | Wallet-based auth gating `/portfolio`, no separate password/account system |
| Automation | GitHub Actions (6 scheduled jobs) | Ingest, create, resolve, finalize, lifecycle sync, anomaly monitor — no server to maintain, no human in the loop |
| Smart contract | Solidity 0.8, Arc Testnet | `AgentArena.sol`, verified, dependency-free |
| Cross-chain | Circle CCTP V2 (Fast Transfer) + Iris attestation | Native USDC bridging without a custodian |
| Package manager | bun | Fast installs, single lockfile |

---

## Repository layout

```
geomacro/
├── src/
│   ├── components/
│   │   └── sections/
│   │       ├── arena-section.tsx       # Agent Arena market UI
│   │       ├── bridge-section.tsx      # CCTP V2 bridge stepper
│   │       └── roadmap-section.tsx     # Shipped/upcoming milestones page
│   ├── routes/
│   │   ├── docs.tsx                    # Developer docs (tabbed guides)
│   │   ├── portfolio.tsx               # Per-wallet positions view, SIWE-gated
│   │   └── ...                         # feed, arena, pipeline, onchain, bridge, roadmap
│   ├── lib/
│   │   ├── arc.ts                      # Arc network config
│   │   ├── rpc-manager.ts              # 5-endpoint rotation + Multicall3 batching
│   │   ├── agent-arena.ts              # Contract read client
│   │   ├── arena-markets.ts            # Market discovery (onchain, no hardcoded list)
│   │   ├── balance.ts                  # Wallet balance reads, multi-RPC fail-over
│   │   ├── cctp.ts                     # CCTP V2 addresses, ABIs, Iris poller
│   │   ├── siwe.ts                     # Sign-In with Ethereum auth for Portfolio
│   │   ├── positions.functions.ts      # Server-side tx verification
│   │   └── roadmap.ts                  # Single source of truth for roadmap data
│   └── hooks/
│       ├── WalletProvider.tsx          # Wallet connection context
│       └── use-wallet.ts
├── scripts/
│   ├── ingest-news.js                  # NewsAPI + Guardian → Groq/Cerebras classify → Supabase insert
│   ├── create-markets.js               # Scans high-severity events, opens markets on Arc
│   ├── resolve-markets.js              # Posts the AI verdict at the 48h mark (AI_RESOLVED)
│   ├── finalize-markets.js             # Closes the dispute window, opens claim()
│   ├── sync-lifecycle.js               # Self-looping every 15 min, keeps lifecycle_stage accurate
│   └── anomaly-monitor.js              # Two-tier WARN/CRITICAL alerting across all jobs
├── .github/workflows/
│   ├── auto-ingest-news.yml            # Runs ingest-news.js
│   ├── auto-create-markets.yml         # Runs create-markets.js
│   ├── auto-resolve-markets.yml        # Runs resolve-markets.js
│   ├── auto-finalize-markets.yml       # Runs finalize-markets.js
│   ├── sync-lifecycle.yml              # Runs sync-lifecycle.js every 15 min
│   └── anomaly-monitor.yml             # Runs anomaly-monitor.js
└── public/
```

---

## Local setup

```bash
git clone https://github.com/blocknine0/geomacro.git
cd geomacro
bun install
cp .env.example .env.local
bun run dev
```

You will need your own `NEWSAPI_KEY`, `GROQ_API_KEY` (and optionally `CEREBRAS_API_KEY` for fallback), and a Supabase project. See [`.env.example`](.env.example).

---

## Configuration reference

| Variable | Required by | Notes |
|---|---|---|
| `NEWSAPI_KEY` | ingestion pipeline | Powers the Live Feed and Agent Arena news context |
| `GROQ_API_KEY` | ingestion + resolution | Classifies articles and judges market resolution |
| `CEREBRAS_API_KEY` | ingestion + resolution | Fallback inference provider when Groq quota is exhausted |
| `APP_SUPABASE_URL` / `APP_SUPABASE_ANON_KEY` | ingestion, feed | Persists classified events; leave unset to skip persistence |
| `VITE_ARC_NETWORK` | frontend (build-time) | Force `mainnet` or `testnet`; leave unset for auto |
| RPC endpoint keys (Alchemy / QuickNode / GetBlock / dRPC) | `RpcManager` | One key per rotating endpoint; see `.env.example` for exact variable names |

---

## Product surfaces

| Page | Purpose |
|---|---|
| `/` | Marketing surface — what Geomacro is, live activity |
| `/feed` | Live, classified news feed across four categories |
| `/arena` | Active markets — stake on Hawk or Dove, see pre-stake AI arguments |
| `/pipeline` | How ingestion and classification work, in detail |
| `/onchain` | Contract details, testnet/mainnet network info |
| `/bridge` | Pull USDC into Arc via CCTP V2 |
| `/portfolio` | Per-wallet positions across all markets, gated behind Sign-In with Ethereum (SIWE) |
| `/roadmap` | Shipped and upcoming milestones |
| `/docs` | Developer documentation — architecture, API, competitive moat |

---

## Design principles

1. **Contract state is source of truth.** Supabase is a read cache for the feed, not a system of record — market state always comes from the chain.
2. **No human in the automation loop.** Ingestion, market creation, and resolution all run unattended on a schedule. If that's wrong, it's a code fix, not a manual override.
3. **Honest about the resolution tradeoff.** LLM-judged settlement is disclosed as a limitation, not hidden behind confident language. Decentralized dispute resolution is on the roadmap, not glossed over.
4. **Relevance over volume.** The classification gate is strict on purpose — a market surface that lets through noise (celebrity gossip tagged "macro") is worse than a sparser, cleaner one.
5. **The chain should stay out of the way.** Native USDC gas means every action is one cheap, stablecoin-denominated transaction — no bridging friction baked into the core loop.
6. **Assume a job will fail, and watch for it.** Every scheduled job can miss a run. `sync-lifecycle.js` re-derives state from the clock instead of trusting that the last job fired on time, and `anomaly-monitor.js` watches the rest with a two-tier WARN/CRITICAL threshold so a silent failure doesn't sit undetected.

---

## Roadmap

- [x] Live feed pipeline with relevance-gated classification across 4 categories
- [x] Smart contract deployed and verified on Arc Testnet
- [x] Full create, stake, resolve and claim cycle tested onchain
- [x] Automated market creation from live events via GitHub Actions
- [x] Automated market resolution via Groq judgment after 48-hour window
- [x] Dynamic Arena with no hardcoded markets, pure on-chain discovery
- [x] AI Duel feature showing market-specific Hawk and Dove arguments before staking
- [x] Cross-chain USDC bridge into Arc Testnet via Circle's CCTP V2
- [ ] Decentralized dispute-based resolution instead of LLM-attested settlement
- [ ] Mainnet deployment
- [ ] Public track record showing how often Hawk vs. Dove actually calls it right
- [ ] Full mobile wallet support via WalletConnect for external browsers

Full versioned history with dates: [geomacro.live/roadmap](https://www.geomacro.live/roadmap)

---

## Why Arc

Risk markets like this live or die on settlement cost and speed. Arc's native USDC gas means every stake, claim, and market creation is just one cheap, stablecoin-denominated transaction. No bridging, no wrapped tokens, no separate gas token to keep topped up. That is basically the whole bet here. The chain should stay out of the way of the prediction, not add friction on top of it.

---

Built by [@blocknine0](https://github.com/blocknine0) · Questions or bugs? [Open an issue](https://github.com/blocknine0/geomacro/issues)
