# Geomacro — Onchain Geopolitical Risk Oracle on Arc

Geomacro is an AI-driven oracle that classifies live geopolitical and macro
news, runs multi-agent debate to produce probabilistic verdicts, and
publishes attested events onchain to the [Arc Network](https://arc.network)
(USDC-gas L1 by Circle).

- **Live preview:** https://geomacrooracle.lovable.app
- **Stack:** TanStack Start (React 19 + Vite 7) on Cloudflare Workers,
  Tailwind v4, shadcn/ui, TanStack Query, viem for wallet/RPC, Firecrawl
  for live news search, Lovable AI Gateway for inference.
- **Networks:** Arc Testnet (chainId `0x4cef52` / `5042002`), with
  mainnet auto-promotion ready (`src/lib/arc.ts`).

---

## What it does

1. **Live news ingest** — Firecrawl search pulls macro / geopolitical /
   markets headlines on a fixed cadence. Results are sanitized
   server-side (no internal IDs leak — enforced by
   `src/__tests__/live-feed-no-ids.test.ts`).
2. **AI classification** — each item is scored for severity, region,
   asset impact and risk vector via Lovable AI Gateway.
3. **Agent duel** — two opposing agents argue each market; a main-agent
   judge issues a probabilistic verdict with rationale.
4. **Onchain publish** — verdicts are written as attestation events to
   the connected Arc network through the user's wallet. USDC is the
   native gas token (18 decimals onchain).
5. **Wallet feed** — recent attestations and tx hashes are surfaced
   with explorer deep-links.

## Repository layout

```
src/
  routes/
    __root.tsx                 Root layout, head defaults, error + 404 boundaries
    index.tsx                  Landing + oracle UI
  components/
    autonomous-oracle.tsx      Agent debate + verdict view
    live-news-feed.tsx         Sanitized news feed
    wallet-tx-feed.tsx         Recent attestations on Arc
    ui/                        shadcn primitives
  lib/
    arc.ts                     Arc network config (testnet + mainnet)
    agents.ts / agents.functions.ts        Agent duel (server fn)
    arena-judge.functions.ts   Main-agent judge (server fn)
    autonomous-agent.functions.ts          Autonomous loop
    live-feed.functions.ts     News feed RPC + caching
    live-feed.sanitize.ts      Strips internal IDs before client return
    firecrawl.server.ts        Firecrawl search (server-only)
    ai-gateway.server.ts       Lovable AI Gateway client (server-only)
    balance.ts                 USDC-on-Arc balance formatting
    wallet-tx.ts               Session tx memory
    attestation.ts             Onchain attestation payload builder
    config.server.ts           Server config reader
  hooks/
    use-wallet.ts              EIP-1193 wallet + Arc chain switch
  __tests__/
    live-feed-no-ids.test.ts   Guarantees client/API output has no internal IDs
public/
  robots.txt, sitemap.xml
```

Server-only files end in `.server.ts`; client-callable RPC files end in
`.functions.ts` and are invoked via `useServerFn(...)` from TanStack
Start. Never import a `.server.ts` from a component.

## Environment variables

See `.env.example`. Public values are prefixed `VITE_` and ship to the
browser; everything else is server-only.

| Name | Scope | Purpose |
| --- | --- | --- |
| `LOVABLE_API_KEY` | server | Lovable AI Gateway (managed; rotate via Lovable) |
| `FIRECRAWL_API_KEY` | server | Live news search |
| `VITE_ARC_NETWORK` | public | Force `mainnet` or `testnet` (default: auto) |

## Local development

```bash
bun install
cp .env.example .env       # fill in keys
bun run dev                # http://localhost:8080
bun run lint
bunx vitest run            # runs the no-internal-IDs test
bun run build              # production build (Cloudflare Worker target)
```

## Security posture

- No private keys server-side. All onchain writes are signed by the
  user's wallet (EIP-1193).
- Server functions read secrets inside `.handler()` only — never at
  module scope.
- News-feed sanitizer removes internal cache/event identifiers before
  any response leaves the server; a vitest unit test enforces this.
- `Publish to Arc` admin action is hidden in the public UI.
- Error boundaries (`__root.tsx`) catch and report runtime errors
  without leaking stack traces to end users.

## License

MIT — see [LICENSE](./LICENSE).

## For reviewers (Arc team)

Quick verification path:

1. `bun install && bunx vitest run` — confirms sanitization invariants.
2. `bun run build` — confirms the project builds for the Cloudflare
   Worker target with zero TS errors.
3. Open the live preview, connect a wallet, switch to Arc Testnet, and
   confirm a verdict can be attested onchain (tx hash deep-links to
   `testnet.arcscan.app`).
4. Inspect `src/lib/arc.ts` for the exact chain config used.

Questions → open an issue or reach out via the repository contact.