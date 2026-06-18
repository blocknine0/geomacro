export type ArcNetwork = {
  key: "testnet" | "mainnet";
  chainIdDec: number;
  chainIdHex: string;
  chainName: string;
  rpcUrl: string;
  explorer: string;
  currency: { name: string; symbol: string; decimals: number };
  faucet?: string;
  live: boolean; // false until mainnet ships
};

export const ARC_TESTNET: ArcNetwork = {
  key: "testnet",
  chainIdDec: 5042002,
  chainIdHex: "0x4cef52",
  chainName: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
  // Arc uses USDC as the native gas token with 18 decimals on-chain
  // (not the ERC-20 USDC 6-decimal convention).
  currency: { name: "USDC", symbol: "USDC", decimals: 18 },
  faucet: "https://faucet.circle.com",
  live: true,
};

/** Placeholder mainnet config. Update chainId/RPC/explorer the day Arc mainnet goes live;
 * the app auto-shifts once the wallet reports the mainnet chainId. */
export const ARC_MAINNET: ArcNetwork = {
  key: "mainnet",
  chainIdDec: 5042001,
  chainIdHex: "0x4cef51",
  chainName: "Arc",
  rpcUrl: "https://rpc.arc.network",
  explorer: "https://arcscan.app",
  currency: { name: "USDC", symbol: "USDC", decimals: 18 },
  live: false, // flip to true after mainnet launches
};

export const ARC_NETWORKS: ArcNetwork[] = [ARC_MAINNET, ARC_TESTNET];

/** Map a wallet-reported chainId (hex or decimal) to a known Arc network. */
export function networkByChainId(chainId: string | number | null | undefined): ArcNetwork | null {
  if (chainId == null) return null;
  const hex = typeof chainId === "string"
    ? chainId.toLowerCase()
    : ("0x" + chainId.toString(16)).toLowerCase();
  return ARC_NETWORKS.find((n) => n.chainIdHex.toLowerCase() === hex) ?? null;
}

/** Preferred network for new connections: mainnet when live, else testnet.
 * Overridable at build time via VITE_ARC_NETWORK ("mainnet" | "testnet"). */
export function preferredNetwork(): ArcNetwork {
  const flag = (import.meta.env.VITE_ARC_NETWORK as string | undefined)?.toLowerCase();
  if (flag === "mainnet" && ARC_MAINNET.live) return ARC_MAINNET;
  if (flag === "testnet") return ARC_TESTNET;
  return ARC_MAINNET.live ? ARC_MAINNET : ARC_TESTNET;
}

export const SAMPLE_EVENTS = [
  {
    id: "evt_8a91",
    narrative: "Strait of Hormuz tanker incident",
    stage: "Active Escalation",
    severity: 78,
    confidence: 82,
    delta: +9,
    publishedAt: "2026-06-13T08:14:00Z",
    source: "Reuters",
  },
  {
    id: "evt_8a92",
    narrative: "US Treasury widens secondary sanctions list",
    stage: "Building",
    severity: 54,
    confidence: 76,
    delta: +4,
    publishedAt: "2026-06-13T07:42:00Z",
    source: "Bloomberg",
  },
  {
    id: "evt_8a93",
    narrative: "Red Sea shipping insurance premia spike 22%",
    stage: "Building",
    severity: 61,
    confidence: 71,
    delta: +6,
    publishedAt: "2026-06-13T06:55:00Z",
    source: "Lloyd's List",
  },
  {
    id: "evt_8a94",
    narrative: "Cairo-mediated ceasefire talks resume",
    stage: "Fragile Ceasefire",
    severity: 38,
    confidence: 64,
    delta: -5,
    publishedAt: "2026-06-13T05:20:00Z",
    source: "AP",
  },
] as const;