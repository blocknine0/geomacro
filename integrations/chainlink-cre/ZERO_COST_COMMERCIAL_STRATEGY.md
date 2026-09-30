# Geomacro x Chainlink: zero-cost-first commercial strategy

## Objective

Use Chainlink primarily for distribution, credibility, ecosystem visibility and data monetization while keeping Geomacro's founder-funded production cost at or near zero during initial commercial launch.

This strategy does not assume that production infrastructure can remain literally free at unlimited scale. The commercial boundary is instead: **no new paid Chainlink production dependency and no expensive Geomacro work before a request is funded or explicitly sponsored.**

## Cost rule

Geomacro must not enable a paid CRE deployment, dedicated oracle infrastructure, mainnet write, premium data source, or other recurring Chainlink cost from founder funds during the initial launch.

Allowed before revenue/sponsorship:

- local CRE simulation
- free public capability discovery
- existing Geomacro free-tier infrastructure
- GitHub CI within existing allowance
- partner/application materials
- testnet work with free faucet/test resources

Not allowed before revenue/sponsorship:

- recurring paid CRE/DON deployment paid by Geomacro
- self-funded mainnet gas for continuous publishing
- a free public endpoint that performs the same expensive work as the commercial x402 product
- duplicated raw-data storage only for Chainlink
- premium third-party data contracts without matching revenue

## Commercial request path

1. A machine or customer performs a cheap/free discovery or deliverability check.
2. Geomacro proves product availability and exact commercial terms without running unnecessary expensive work.
3. Commercial intelligence remains behind the existing x402 payment boundary.
4. Only a funded/authorized request performs the expensive intelligence path.
5. Reusable governed results are cached/served from the existing storage architecture where valid.
6. Chainlink can become an additional distribution/oracle consumer without creating a second free commercial product.

This makes variable work revenue-backed instead of founder-funded.

## Chainlink routes, in priority order

### 1. Data Provider route — primary

Position Geomacro as a specialized geopolitical, macroeconomic and critical-mineral intelligence API/data provider.

Ask Chainlink for:

- data-provider onboarding discussion
- guidance on the most suitable delivery product (CRE/DataLink/feed-style integration)
- ecosystem introductions to applications that need risk/economic/critical-mineral data
- co-marketing or public integration visibility if/when a technical integration is accepted
- commercial terms where downstream consumers fund data usage

Do not promise a free production feed.

### 2. Chainlink Grant — funding route

Apply for a grant around a reusable reference integration that brings high-quality geopolitical/macro/critical-mineral intelligence into Chainlink workflows.

Funding objective: Chainlink/grant resources should cover any integration work that would otherwise create new founder-funded production cost.

### 3. CRE PoC — proof, not a production bill

Use the isolated `integrations/chainlink-cre` workflow to demonstrate compatibility through local simulation.

Do not deploy it to a paid production DON until one of these is true:

- Chainlink approves/sponsors the deployment,
- a customer contract funds it,
- grant funding covers it, or
- measured Geomacro revenue comfortably covers it.

### 4. Build / ecosystem programs — visibility only if terms fit

Use Build or related ecosystem programs only after reviewing current commercial/token commitments. Do not introduce a token solely to qualify for visibility.

If a program offers co-marketing, technical support, ecosystem introductions or infrastructure incentives without creating an unacceptable token/recurring-cost obligation, it can be evaluated separately.

## Visibility plan

Create one credible public integration story instead of generic promotion:

**"Geomacro risk intelligence is Chainlink CRE-ready: signed, machine-readable geopolitical/macro/critical-mineral intelligence with a fail-closed commercial boundary."**

Assets to prepare:

- public GitHub PoC
- deterministic capability contract
- 30–60 second demo recording
- one technical architecture diagram
- one concise integration post/thread
- data-provider application
- grant application
- direct outreach to Chainlink Data/CRE ecosystem contacts
- optional Chainlink community/hackathon demo where relevant

Visibility claims must say `PoC`, `CRE-ready`, `integration candidate`, or `data-provider proposal` until Chainlink formally accepts an integration/partnership. Never imply an official Chainlink partnership before confirmation.

## Geomacro infrastructure cost controls

Keep the existing low-cost architecture as the source of truth:

- Supabase for active operational state only
- B2/cold object storage for verified archival/raw material where already designed
- bounded retention and cleanup
- no duplicate Chainlink-specific raw archive
- cache deterministic reusable outputs when freshness contracts permit
- free discovery endpoints must be cheap and bounded
- expensive real-time assembly happens only after commercial authorization/payment
- fail closed when freshness/coverage cannot be proven

## Success criteria before any paid Chainlink production step

At least one of:

1. Chainlink provides an accepted data-provider/commercial route.
2. A Chainlink grant or ecosystem incentive covers integration cost.
3. A paying customer funds the Chainlink delivery path.
4. Existing Geomacro revenue covers the recurring cost with a predefined margin buffer.

Until then the CRE integration remains simulation/testnet-only and creates no new recurring production bill.
