export const TESTNET_PUBLIC_ACCESS_VERSION = "testnet-public-access-v1.0.0" as const;

export const TESTNET_PUBLIC_API_KEYS = {
  arcTestnet: {
    chain_key: "arcTestnet",
    label: "Arc Testnet",
    public_api_key: "gmk_public_arc_testnet_v1",
  },
  baseSepolia: {
    chain_key: "baseSepolia",
    label: "Base Sepolia",
    public_api_key: "gmk_public_base_sepolia_v1",
  },
  polygonAmoy: {
    chain_key: "polygonAmoy",
    label: "Polygon Amoy",
    public_api_key: "gmk_public_polygon_amoy_v1",
  },
} as const;

export type TestnetPublicChainKey = keyof typeof TESTNET_PUBLIC_API_KEYS;

export type TestnetPublicAccessEntry =
  (typeof TESTNET_PUBLIC_API_KEYS)[TestnetPublicChainKey];

const byPublicKey = new Map<string, TestnetPublicAccessEntry>(
  Object.values(TESTNET_PUBLIC_API_KEYS).map((entry) => [entry.public_api_key, entry]),
);

export function testnetPublicAccessByApiKey(value: string | null | undefined) {
  const key = String(value ?? "").trim();
  return byPublicKey.get(key) ?? null;
}

export const TESTNET_PUBLIC_ACCESS_BOUNDARIES = {
  public_key_is_secret: false,
  public_key_grants_access_without_wallet_session: false,
  wallet_session_required: true,
  payment_required_per_call: true,
  exact_request_binding_required: true,
  execution_authorized: false,
} as const;
