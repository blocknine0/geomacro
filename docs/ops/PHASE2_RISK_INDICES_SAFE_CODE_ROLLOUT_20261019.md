# Phase 2 Risk Indices code/continuity acceptance, no funds

The independent Risk Indices Worker no longer requires a missing retired
Postgres publisher continuity artifact solely to roll out protective quota
code. On exact main push when the prior immutable artifact cannot be read,
the already-reviewed assess-risk-indices-code-deploy gate first refuses to
overwrite an actually verified current signed 200. Otherwise it deploys
explicit null continuity. The Worker serves authentic D1/B2 proofs if
available; otherwise signed Risk Indices stays HTTP 503.

The standard signed source/manual workflow still requires actual full B2
readback proof and a live <=60m original-clock 200. On code-only rollout
it checks only 404/405 code guard and independently checks the existing
D1 historical-continuity route as historical-only; no B2 GET is spent
in the code-only probe and no HTTP 200 current signed claim is made.

The emergency shared quota-safety matrix uses the same source-preserving
fallback for risk-indices only; Intelligence and Global Risk still fail
when their signed continuity proof is missing.

This does not generate real GRI certificates, renew old scores, change
original timestamps, activate Supabase or enable USDC funds.
