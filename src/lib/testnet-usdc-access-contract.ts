import { CCTP_CHAINS } from "./cctp";

export const TESTNET_USDC_ACCESS_VERSION = "testnet-usdc-access-v1.0.0" as const;
export const TESTNET_USDC_ACCESS_OFFER_ID = "testnet_tester_pass_30d" as const;
export const TESTNET_USDC_ACCESS_PRICE_USDC = "1.00" as const;
export const TESTNET_USDC_ACCESS_PRICE_ATOMIC = 1_000_000n;
export const TESTNET_USDC_ACCESS_CREDITS = 250 as const;
export const TESTNET_USDC_ACCESS_DURATION_DAYS = 30 as const;

export const TESTNET_USDC_RECEIVER_ENV = "TESTNET_USDC_RECEIVER_ADDRESS" as const;

export type TestnetUsdcChainKey =
  | "arcTestnet"
  | "ethSepolia"
  | "baseSepolia"
  | "polygonAmoy"
  | "arbitrumSepolia"
  | "opSepolia"
  | "avalancheFuji"
  | "unichainSepolia"
  | "lineaSepolia";

const keys: TestnetUsdcChainKey[] = [
  "arcTestnet",
  "ethSepolia",
  "baseSepolia",
  "polygonAmoy",
  "arbitrumSepolia",
  "opSepolia",
  "avalancheFuji",
  "unichainSepolia",
  "lineaSepolia",
];

export const TESTNET_USDC_CHAINS = Object.fromEntries(
  keys.map((key) => {
    const chain = CCTP_CHAINS[key];
    if (!chain) throw new Error(`Missing CCTP testnet chain config: ${key}`);
    return [
      key,
      {
        key,
        name: chain.name,
        chain_id: chain.chainIdDec,
        chain_id_hex: chain.chainIdHex,
        usdc_address: chain.usdc,
        explorer_url: chain.explorerUrl,
        payment_asset: "USDC" as const,
        decimals: 6 as const,
        environment: "testnet" as const,
        revenue_classification: "testnet_non_revenue" as const,
      },
    ];
  }),
) as Record<
  TestnetUsdcChainKey,
  {
    key: TestnetUsdcChainKey;
    name: string;
    chain_id: number;
    chain_id_hex: string;
    usdc_address: string;
    explorer_url: string;
    payment_asset: "USDC";
    decimals: 6;
    environment: "testnet";
    revenue_classification: "testnet_non_revenue";
  }
>;

export function testnetChainById(chainId: number) {
  return Object.values(TESTNET_USDC_CHAINS).find((chain) => chain.chain_id === chainId) ?? null;
}

export function requireTestnetUsdcReceiver(env: Record<string, string | undefined> = process.env) {
  const value = String(env[TESTNET_USDC_RECEIVER_ENV] ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${TESTNET_USDC_RECEIVER_ENV} must contain the dedicated EVM receiving wallet address`);
  }
  return value.toLowerCase();
}

export const TESTNET_USDC_ACCESS_BOUNDARIES = {
  free_access: false,
  payment_required: true,
  payment_is_real_revenue: false,
  transferable_credits: false,
  cash_redeemable_credits: false,
  raw_data_delivery: false,
  upstream_news_source_identity_exposed: false,
  execution_authorized: false,
} as const;
