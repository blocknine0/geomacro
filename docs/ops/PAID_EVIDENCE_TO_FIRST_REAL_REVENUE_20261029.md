# Production paid-source acquisition → canonical evidence → first real USDC sale

## Last independent evidence (2026-10-28)
- First earnings acceptance: https://github.com/blocknine0/geomacro/actions/runs/40787017401
- USA critical-minerals $0.02 country digest: DATA ELIGIBLE but Coinbase payment rail LOCKED.
- USA macro_risk missing macro_monetary; conflict_geopolitics missing geopolitical_security.
- Live 100-question audit: https://github.com/blocknine0/geomacro/actions/runs/40784300375 — 63 scope 400, 35 evidence 422, 2 read/availability 503 and zero 402. Those are real no-charge outcomes, not sales.

## Existing acquisition paths (no duplicate fetcher)
1. Macro/FX: official World Bank WDI v2 (e.g., https://api.worldbank.org/v2/country/all/indicator/FP.CPI.TOTL.ZG?format=json), IMF SDMX and national central banks. Producer candidates: world-bank-ppg-global-shadow-census, wdi-commercial-signal-self-heal and imf-oecd-native-period. Validate ISO3, indicator, release/reference period, rights, exact normalized hash; ingestion date is not original publication date. Annual observations are structural, not current breaking news.
2. Geopolitics: existing official first-party security/diplomacy/sanctions/trade publisher mesh, Three-Domain Original Publisher Pulse, governed current event ingestion. Validate source-native original, status, relevant ISO3, publisher release date and derived country/module. Free website 72h observations do NOT imply a verified structural module or a signed object.
3. Critical Minerals: existing 2026 USGS MCS pinned official CSV, independently verified CC0 dataset rights and country/mineral data; plus separately reviewed national geological surveys. Country production reference years are structural, not live supply-shock announcements. src/lib/qualified-mcs-country-digest.server.ts already implements this specific qualified source.
4. Corridors: BOTH countries need independent qualified observations, comparable reference periods and explicit direction. Never infer bilateral trade from two independent annual mineral production series.
5. Signed/current intelligence: exact original current events, hot_topics qualification, signed GRO genuine Ed25519 with valid key/expiry; free OSINT never automatically qualifies as a paid source.

## Canonical handoff required before a 422 can become paid
Existing GitHub Actions collector → publisher source-native date and hash → source rights/quality check → SAME governed D1 ingest → B2 immutable derived snapshot when appropriate → verified Store module readback → products-availability (no-funds) → exact immutable response hash → canonical x402 challenge → verified payer settlement and durable replay.
The protected PREDGE code/workflows/auth/quota/contracts MUST remain untouched. All 14 module routes are in config/paid-evidence-recovery-routes.v1.json. The owner-only planner creates source-gap tasks; it cannot certify proof or authorize customer billing. It can convert future availability responses into country/module-specific tasks without new D1/B2 reads.
The World Bank governed B2 snapshot reader is bounded to 24 hours. Its legacy publisher is presently manual/quota-held because its underlying Supabase state is frozen. Make a reviewed, separate, D1-origin verified publisher before enabling automatic B2 snapshot refresh; do not extend timestamps or reuse an expired snapshot to bypass a 422.

## Exact first real-money gate (no bypass)
First re-verify current data proof for USA / critical_minerals / structural_country_digest / standard / $0.02. The cited receipt is not a present payment quote.
Securely configure in the merchant's production environment (never GitHub source or chat): COINBASE_X402_ENVIRONMENT=production, COINBASE_X402_PAY_TO (verified Base USDC receiver), CDP_API_KEY_ID and CDP_API_KEY_SECRET. Review durable ledger/nonce/replay, emergency freeze and disabled providers.
Only when owner explicitly authorizes real settlement and all independent acceptance gates pass: GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH and COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC. Do not automatically set either approval. Zero-funds 402 is not settlement.
Then require verified 402 challenge, genuinely signed payer proof, settled USDC receipt, immutable 200 structured JSON and idempotent exact-byte replay. No paid 200 without verified settlement.

## Acceptance checklist
- All 195 countries × 3 category routes tested OFFLINE; not falsely called 585 current news items.
- Strict per-product dimension/observation thresholds and no raw upstream customer redistribution.
- Each missing/stale source module names its existing responsible producer, actual evidence timestamp and owner recovery status; no silent SKU/price changes.
- No 100/100 real paid-answers claim until each requested variant has true current evidence and settlement; a 422 is correct when source proof is missing.
- GitHub CI and published website exact-SHA are necessary but not sufficient for merchant and data-production activation.
