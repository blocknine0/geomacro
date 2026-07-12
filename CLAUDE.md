# Geomacro Dev Rules

## Build and Run

- Install dependencies: `bun install`
- Frontend (dev server): `bun run dev`
- Frontend (production build): `bun run build`
- Lint: `bun run lint`
- Format: `bun run format`

## Oracle / pipeline scripts

These normally run on a schedule via GitHub Actions (`.github/workflows/`), but can
be run manually for testing:

- Ingest news: `node scripts/ingest-news.js`
- Create markets: `node scripts/create-markets.js`
- Resolve markets: `node scripts/resolve-markets.js`
- Finalize markets: `node scripts/finalize-markets.js`

Each needs `NEWSAPI_KEY`, `GROQ_API_KEY`, and the Supabase variables from
`.env.example` set locally.

## Smart contracts

The deployed contract is `AgentArena` on Arc Testnet (chain ID `5042002`), currently
at `0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe`. There is no Foundry or Hardhat
project in this repo yet, the contract was deployed without the source checked into
version control. If you're adding a `contracts/` directory and a test suite, pull the
verified source from Arcscan first rather than reconstructing it from the ABI alone.

## Code style

- **TypeScript**: strict types, no `any` unless there's a real reason, functional
  components, Tailwind for styling (see the frontend-design conventions already in
  the codebase).
- **Solidity** (once the source is in-repo): explicit visibility on every function,
  custom errors instead of `require` strings, NatSpec comments on public/external
  functions.
- **Scripts**: plain Node.js, no build step, keep them runnable with a single
  `node scripts/x.js` call so GitHub Actions can call them directly.

## What this repo is not

- Not a Python project. There's no `poetry`, no `src/main.py`, no Python anywhere.
  If you see a task or doc referencing a Python backend for this repo, that's wrong,
  fix the doc rather than adding a Python file to match it.
