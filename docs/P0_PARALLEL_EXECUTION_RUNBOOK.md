# Optional P0 Capacity Certification Operator Runbook

Status: **OPTIONAL SCALE CERTIFICATION · NOT AN INITIAL COMMERCIAL LAUNCH BLOCKER**

This runbook covers the existing high-scale 40k staging proof. It is intentionally separate from the initial no-funds commercial pay-per-call path.

The initial commercial target is **0.05 USDC per successful paid intelligence delivery for the first 10,000 deliveries**. That 10,000-delivery target is an adoption/revenue milestone after customers pay for the service; it is not a founder-funded test workload.

## Important boundary

The 40k workflows remain useful for future infrastructure/scalability evidence, but they must not be treated as a prerequisite for initial commercial activation.

Throughout this optional scale track:

- `launch_mode` remains `prelaunch`;
- `production_funds_authorized` remains `false`;
- `official_launch_announced` remains `false`;
- no mainnet payment acknowledgement is set;
- no production payment credential is used for the load test;
- no real-money settlement is performed;
- no load test is pointed at `geomacro.live`.

## When to run it

Run this track later when isolated staging infrastructure and the required 40-runner fleet are available.

It produces scale evidence for:

- 1M-request / 40k RPS burst;
- 12M-request / 40k RPS five-minute soak;
- DB/edge/runtime telemetry;
- auth/rate-limit boundaries;
- response leakage checks;
- replay/idempotency behavior.

It does **not** establish commercial revenue, customer traction, predictive accuracy or third-party certification.

## Initial commercial path

For the current founder/no-funds situation, use:

1. current `main` release candidate;
2. `Initial Commercial Pay-Per-Call Acceptance`;
3. production configuration while all real-funds acknowledgements remain closed;
4. final owner authorization when the service is genuinely ready to accept production payments;
5. independent production purchase and reconciliation;
6. track progress toward the 10,000 paid-delivery adoption milestone.

Do not block that sequence on 40k capacity certification.

## Evidence interpretation

The optional 40k proof may later support a statement that the recorded isolated staging candidate passed the specified 40k test contract.

It must never be presented as proof of unlimited production capacity.

