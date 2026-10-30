# Complete the seven-product Store on Base mainnet

All twelve Store variants use the canonical query, exact catalog prices,
qualified evidence capture, sanitized structured output and existing immutable
quote/delivery vault. Source/data readiness, runtime configuration, prepared
customer bytes and actual settlement are separate recorded results.

## Current operator blockers (24 October 2026)

The public twelve-variant audit on main found one data-eligible variant and
zero mainnet-quote-eligible variants:
https://github.com/blocknine0/geomacro/actions/runs/40093809799

Additional public country-digest preflights proved actual annual
critical-minerals availability for USA, CAN and IND. The India reporting-FX
preflight remained unavailable. The live runtime still reported testnet,
receiver mismatch and missing B2 runtime configuration. These are not fixed by
green unit tests or GitHub-to-Lovable source sync.

The qualified-release composition loader reads each requested corridor endpoint
and missing profile dimension through the existing reviewed release readers.
It retains genuine native dates and both endpoint requirements. It does not
substitute minerals for macro/FX, create a route model, create a current news
event from an annual series, or sign an object. Missing dimensions still block
the exact selected product. Available archive observations are reused.

## Source-by-source Store data-preflight selection

The commercial Store may ingest mixed independently governed archive, official
country release and fallback observations. A dataset being ingested or an
endpoint returning HTTP 200 is **not** a commercial eligibility grant.

For the exact requested country, corridor endpoints and module dimensions,
the Store now selects only observations with a genuine source-native clock,
bounded freshness, exact source hash and an affirmative per-source commercial
rights decision. A rights-ineligible row cannot contaminate or block a
separately eligible row from another source. If a previously fresh archive row
fails rights validation, the existing official USGS Minerals and Treasury FX
release readers may be attempted with their own pinned rights, scope and byte
proof. The later admission check still revalidates every source and every
endpoint/module; the selected evidence is pinned into quote/delivery.

Provider errors, no original publication, missing licence, old numerical
reference periods, country mismatch and missing signed GRO/certificates remain
explicit `NOT_AVAILABLE`, `COMMERCIAL_SOURCE_NOT_ELIGIBLE`, or another
fail-closed preflight result. This does **not** authorize unknown new feeds
or guarantee 12/12, worldwide 195x3 live coverage, production Base mainnet
readiness or paid settlement. Unverified sources are excluded rather than
silently promoted. Adding a truly new source requires a separate permitted
adapter, publisher/terms verification, source identity, rights audit and
live original readback.

Tests:
`bunx --no-install vitest run src/lib/store-structural-release-context.server.test.ts src/lib/store-product-creation.server.test.ts`.

## Lovable production server settings

Configure these in the server secret manager, then publish the latest synced
main. The public receiver below was independently verified by EIP-191 message recovery on 2026-10-30 (Etherscan signature record #340876). A signed ownership proof is NOT a completed merchant settlement or approval to transfer funds. Existing production secrets and historic receipts must be reconciled before enabling any new pay-to address.

```dotenv
GEOMACRO_USDC_RECEIVER=0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5
COINBASE_X402_PAY_TO=0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5
CIRCLE_X402_SELLER_ADDRESS=0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5
COINBASE_X402_ENVIRONMENT=production
COINBASE_X402_PRICE_USDC=0.05
GEOMACRO_COMMERCE_EMERGENCY_FREEZE=true
GEOMACRO_COMMERCE_LEDGER_BACKEND=durable_object
GEOMACRO_COMMERCE_LEDGER_URL=https://geomacro-commerce-ledger.daspallab202391.workers.dev
GEOMACRO_CENTRAL_SECURITY_MODE=enforce
```

Supply actual private values for:

- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` from the owner's Coinbase server API key.
- `B2_ARCHIVE_READ_KEY_ID`, `B2_ARCHIVE_READ_APPLICATION_KEY` for the existing
  private archive; preserve a dedicated read-only key.
- `GEOMACRO_COMMERCE_LEDGER_TOKEN`: the existing authorized shared value,
  matching the ledger Worker's `LEDGER_SHARED_TOKEN`.
- `GEOMACRO_SECURITY_FINGERPRINT_PEPPER`, `GEOMACRO_API_CREDENTIAL_PEPPER`:
  retain existing private values; create separate random values of at least
  32 characters only if absent.

Do not put secret values in chat, GitHub files, public artifacts, `VITE_*`,
request examples or client code. Human/production signing private keys stay in
their approved protected issuer, outside Lovable and the public API.

The `0.05` server fallback does not replace the requested variant's locked
catalog price. `production` is the accepted environment literal; `mainnet`
is not the accepted value of `COINBASE_X402_ENVIRONMENT`. Explicit Store
requests refuse the testnet network or a substituted USDC contract. A frozen
production rail continues returning no-charge data diagnostics.

## Required live evidence

For every exact requested country/corridor and module, retain genuine current
source-native observations and valid scoped source permissions. Structural
profiles need at least two requested dimensions. Each corridor dimension needs
actual observations for both endpoints. A structural product does not require
an invented GRO or an unrelated numerical GRI snapshot.

Signed products and Risk Gate bundles require the real current country/corridor
GRO, trusted signature verification and readback. The machine-commercial
qualification contract is documented in
`docs/ops/GEOMACRO_AUTOMATED_COMMERCIAL_GRO_V1.md`. Its hosted public authority
configuration check does not itself supply signed evidence.

Use the existing protected publisher with a real approved immutable input and
its independently supplied SHA-256. `intelligence-machine-current.yml` accepts
the actual dual-signed B2 key and pin. It verifies distinct approved facts and
rights authorities and publishes/readbacks without exposing their private
keys. The newly-qualified Store variant also needs a real signed publication
after the recent `product.issued_after` cutoff; querying never signs an object.

## Finish and verify

1. Publish the latest main with the server settings above and the emergency
   freeze retained. Verify the deployed SHA, receiver alignment and B2 runtime
   access, then inspect every exact request's data availability.
2. Run `store-12-variant-readiness-no-funds.yml` on main. Preserve the per-variant
   data and mainnet-network results; 12 successful examples do not certify all
   195 countries or any fabricated live event.
3. After genuine product proof and the owner's coordinated launch decision,
   set the existing production acknowledgements and remove the freeze:
   `GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH`,
   `COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC`,
   `GEOMACRO_REAL_FUNDS_SECURITY_ACK=I_ACCEPT_REAL_FUNDS_SECURITY_GATES`,
   `GEOMACRO_COMMERCE_EMERGENCY_FREEZE=false`. Publish and recheck.
4. Prove the exact immutable 402 quote, native Base USDC amount and recipient,
   actual provider verification/settlement, same-byte customer delivery,
   same-proof replay without a second charge, and revenue reconciliation.
   The owner supplies any buyer wallet authorization; a readiness census
   never spends funds. A real payment is not inferred from mocked tests.

Only completed live receipts establish launch readiness. Existing automated
source intake and signing jobs run in cloud under their approved authority;
no continuously running laptop is required. Missing production credentials,
real source evidence or issuer signatures stay explicit operator blockers.
