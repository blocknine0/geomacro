import { Contract, ethers, type BrowserProvider, type JsonRpcProvider, type FallbackProvider } from "ethers";

/**
 * CCTP V2 — Cross-Chain Transfer Protocol helpers (ethers v6 port)
 *
 * Bridges USDC from any V2-supported chain to Arc Testnet via burn-and-mint.
 * Reference: https://developers.circle.com/cctp
 *
 * V2 flow (Fast Transfer mode, ~13-19s finality):
 *   1. Source chain: approve USDC -> call TokenMessengerV2.depositForBurn(...)
 *   2. Off-chain   : poll Iris API for attestation
 *   3. Dest chain  : call MessageTransmitterV2.receiveMessage(message, attestation)
 *
 * Contract addresses are identical across every V2-supported chain (CREATE2
 * deploy) - only the domain ID and USDC token address differ per chain.
 *
 * No Bridge Kit / App Kit SDK dependency here on purpose: this mirrors a
 * proven, working, transparent implementation (raw contract calls via
 * ethers), giving explicit control over Fast Transfer speed/fee instead of
 * relying on an SDK's implicit defaults, and stays entirely within
 * Geomacro's existing ethers stack (no viem/wagmi needed).
 */

// -- Universal V2 contracts (same address on every CCTP V2 testnet chain) ---
// ✅ VERIFIED directly against Circle's official docs (not a third-party
// repo): https://developers.circle.com/cctp/references/contract-addresses
// Arc Testnet is explicitly listed there (domain 26) with these exact
// addresses. Mainnet addresses are DIFFERENT (0x28b5a0e9... / 0x81D40F21...)
// — do not reuse these testnet addresses if this app ever targets Arc
// mainnet; re-check the same docs page's "Mainnet contract addresses"
// section at that time.
export const TOKEN_MESSENGER_V2 = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
export const MESSAGE_TRANSMITTER_V2 = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

// -- Iris attestation service -------------------------------------------------
export const IRIS_TESTNET = "https://iris-api-sandbox.circle.com";
export const IRIS_MAINNET = "https://iris-api.circle.com";

// -- Finality thresholds (V2) -------------------------------------------------
export const FINALITY_FAST = 1000; // ~13-19s, small fee (maxFee below)
export const FINALITY_STANDARD = 2000; // waits for hard chain finality, free

// -- Supported chains (testnets only for now) --------------------------------
// ✅ VERIFIED independently against Circle's own circlefin/skills GitHub repo
// (plugins/circle/skills/use-usdc/SKILL.md) — a second, separate official
// Circle source from the contract-addresses docs page above, confirming
// every USDC token address below (including Arc Testnet's, which looks
// unusual but is correct and documented).
export interface CctpChain {
  name: string;
  chainIdDec: number;
  chainIdHex: string;
  domain: number;
  usdc: string; // ERC-20 USDC token address on this chain (6 decimals)
  rpcUrl?: string;
  explorerUrl: string;
}

export const CCTP_CHAINS: Record<string, CctpChain> = {
  arcTestnet: {
    name: "Arc Testnet",
    chainIdDec: 5042002,
    chainIdHex: "0x4cef52",
    domain: 26,
    // CCTP mints to this ERC-20-shaped USDC contract on Arc; Arc's precompile
    // treats it as fungible with the native USDC gas balance.
    usdc: "0x3600000000000000000000000000000000000000",
    rpcUrl: "https://rpc.testnet.arc.network",
    explorerUrl: "https://testnet.arcscan.app",
  },
  ethSepolia: {
    name: "Ethereum Sepolia",
    chainIdDec: 11155111,
    chainIdHex: "0xaa36a7",
    domain: 0,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    explorerUrl: "https://sepolia.etherscan.io",
  },
  baseSepolia: {
    name: "Base Sepolia",
    chainIdDec: 84532,
    chainIdHex: "0x14a34",
    domain: 6,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    explorerUrl: "https://sepolia.basescan.org",
  },
  avalancheFuji: {
    name: "Avalanche Fuji",
    chainIdDec: 43113,
    chainIdHex: "0xa869",
    domain: 1,
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
    explorerUrl: "https://testnet.snowtrace.io",
  },
};

// -- EURC (verified addresses, NOT yet bridgeable via CCTP) -----------------
// ✅ VERIFIED against Circle's official EURC Contract Addresses page:
// https://developers.circle.com/stablecoins/eurc-contract-addresses
// ⚠️ NOT ENABLED: as of this writing, Circle's own actively-maintained CCTP
// sample app (circlefin/circle-cctp-crosschain-transfer, which explicitly
// supports Arc Testnet) only documents USDC transfers. Circle's April 2026
// blog post states EURC support for CCTP's burn-and-mint model is "expected
// later this year" — i.e. not yet shipped. Attempting a depositForBurn with
// an unregistered burnToken would revert on-chain (safe — no fund loss —
// but a broken-looking feature). The StableFX swap route (USDC -> EURC on
// Arc after bridging) was considered as an alternative but is institutional
// KYB/AML-gated (see https://developers.circle.com/stablefx), not viable for
// a permissionless testnet app.
//
// To enable EURC once Circle confirms CCTP support is live: add "eurc" as a
// selectable asset in ASSETS below (no other code changes needed — burnToken
// is already looked up generically per selected asset+chain).
export const EURC_ADDRESSES: Record<string, string> = {
  arcTestnet: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  ethSepolia: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
  baseSepolia: "0x808456652fdb597867f38412077A9182bf77359F",
  avalancheFuji: "0x5E44db7996c682E92a960b65AC713a54AD815c6B",
};

export type BridgeAsset = "usdc"; // add "eurc" here once CCTP-EURC is confirmed live

export const ASSETS: Record<BridgeAsset, { label: string; decimals: number; addresses: Record<string, string> }> = {
  usdc: {
    label: "USDC",
    decimals: 6,
    addresses: Object.fromEntries(Object.entries(CCTP_CHAINS).map(([key, c]) => [key, c.usdc])),
  },
  // eurc: { label: "EURC", decimals: 6, addresses: EURC_ADDRESSES }, // uncomment when live
};

export function getChainByDomain(domain: number): CctpChain | undefined {
  return Object.values(CCTP_CHAINS).find((c) => c.domain === domain);
}

export function getChainById(chainIdDec: number): CctpChain | undefined {
  return Object.values(CCTP_CHAINS).find((c) => c.chainIdDec === chainIdDec);
}

// -- ABIs (ethers human-readable form, matches agent-arena.ts convention) ---
export const TOKEN_MESSENGER_V2_ABI = [
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64 nonce)",
];

export const MESSAGE_TRANSMITTER_V2_ABI = [
  "function receiveMessage(bytes message, bytes attestation) returns (bool success)",
];

export const ERC20_USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// -- Helpers ------------------------------------------------------------------
export function addressToBytes32(addr: string): string {
  return ethers.zeroPadValue(addr.toLowerCase(), 32);
}

export const BYTES32_ZERO = `0x${"00".repeat(32)}`;

// -- Iris attestation polling --------------------------------------------------
export interface IrisMessage {
  attestation: string;
  message: string;
  eventNonce: string;
  cctpVersion: number;
  status: "pending_confirmations" | "complete";
  decodedMessage?: unknown;
}

/**
 * Poll Iris for a CCTP V2 message attestation. Returns the first message
 * that becomes "complete", or throws on timeout.
 */
export async function pollIrisAttestation(
  sourceDomain: number,
  burnTxHash: string,
  opts: { network?: "testnet" | "mainnet"; timeoutMs?: number; intervalMs?: number } = {},
): Promise<IrisMessage> {
  const host = opts.network === "mainnet" ? IRIS_MAINNET : IRIS_TESTNET;
  const url = `${host}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const json = (await res.json()) as { messages?: IrisMessage[] };
        const msg = json.messages?.find((m) => m.status === "complete");
        if (msg) return msg;
      }
    } catch {
      // transient network error - retry on next interval
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Iris attestation timed out after ${timeoutMs}ms for tx ${burnTxHash}`);
}

// -- Contract helpers -----------------------------------------------------------
type AnyProvider = BrowserProvider | JsonRpcProvider | FallbackProvider;

export function getUsdcContract(chain: CctpChain, signerOrProvider: AnyProvider | ethers.Signer) {
  return new Contract(chain.usdc, ERC20_USDC_ABI, signerOrProvider);
}

export function getTokenMessengerContract(signer: ethers.Signer) {
  return new Contract(TOKEN_MESSENGER_V2, TOKEN_MESSENGER_V2_ABI, signer);
}

export function getMessageTransmitterContract(signer: ethers.Signer) {
  return new Contract(MESSAGE_TRANSMITTER_V2, MESSAGE_TRANSMITTER_V2_ABI, signer);
}
