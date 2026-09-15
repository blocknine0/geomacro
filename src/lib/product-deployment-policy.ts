export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_CHAIN_ID_HEX = "0x4cef52" as const;

/**
 * Permanent product boundary.
 *
 * Prediction markets are preserved only as an Arc Testnet technical-proof
 * application. They are not a candidate for Geomacro production/mainnet
 * launch and must never inherit a future default-mainnet wallet setting.
 */
export const PREDICTION_MARKET_DEPLOYMENT_POLICY = {
  status: "technical_proof" as const,
  network: "arc_testnet" as const,
  chainId: ARC_TESTNET_CHAIN_ID,
  mainnetAllowed: false as const,
  realMoneyAllowed: false as const,
  permanentTestnetOnly: true as const,
};

/**
 * Product surfaces that can progress toward production independently of the
 * prediction-market technical proof. "eligible" means architecturally in
 * scope for hardening, not that production readiness has already been earned.
 */
export const PRODUCTION_HARDENING_SCOPE = {
  riskIntelligence: "eligible" as const,
  globalRiskIndex: "eligible" as const,
  askGeomacro: "eligible" as const,
  signedRiskObjects: "private_pilot_gate" as const,
  riskGate: "private_pilot_gate" as const,
  governedApi: "private_pilot_gate" as const,
  predictionMarkets: "testnet_only" as const,
};

export function isPredictionMarketTestnetChainId(
  chainId: string | number | bigint | null | undefined,
): boolean {
  if (chainId == null) return false;

  try {
    const normalized =
      typeof chainId === "string"
        ? BigInt(chainId)
        : BigInt(chainId);

    return normalized === BigInt(ARC_TESTNET_CHAIN_ID);
  } catch {
    return false;
  }
}
