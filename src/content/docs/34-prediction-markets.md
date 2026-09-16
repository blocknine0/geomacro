# 34. Prediction Markets

**Status: TECHNICAL PROOF · ARC TESTNET ONLY**

Prediction markets are a secondary application and feedback layer built during Geomacro's earlier product phase.

## Permanent deployment boundary

Prediction markets are **permanently Testnet-only**.

They are not part of Geomacro's production/mainnet commercialization path and are not planned for real-money mainnet deployment. A future Arc mainnet configuration must not cause this application, its staking/claim flows, market-automation jobs, dispute flow or prediction-market contracts to migrate automatically.

Official prediction-market automation must pass the Arc Testnet target preflight before privileged keys or market state-changing scripts are used. The expected Arc Testnet chain ID is `5042002`.

They demonstrate capabilities such as:

- event-to-market workflows
- test-USDC participation
- smart-contract settlement
- dispute/resolution mechanics
- onchain probability experimentation

They are **not the primary commercial identity of Geomacro**.

```text
Geomacro intelligence
      ├─ Separate Risk Indices
      ├─ Ask Geomacro
      ├─ Risk API / Risk Gate
      └─ Prediction market application — permanent Testnet technical proof
```

The public Risk Indices preserve the audited GRI v1.2 parent methodology and proof lineage. Prediction-market probabilities are a different technical-proof signal and must not be presented as Geomacro risk-index values.

Current market flows are Testnet only and must not be represented as real-money, mainnet or production-market deployment.
