// src/lib/swap.ts
//
// Wraps Circle's App Kit Swap capability (docs.arc.io/app-kit/swap).
// Arc Testnet only supports swapping between USDC, EURC, and cirBTC — App
// Kit supports more tokens on other chains, but we only ever call this
// with chain: "Arc_Testnet", so we constrain the type to match.
import { AppKit } from "@circle-fin/app-kit";
import { createEthersAdapterFromProvider } from "@circle-fin/adapter-ethers-v6";
import { parseUnits, type Eip1193Provider } from "ethers";
import { chargeProtocolFee, computeProtocolFeeWei, formatFeeUsdc } from "./protocol-fee";

export type ArcSwapToken = "USDC" | "EURC" | "cirBTC";
export const ARC_SWAP_TOKENS: ArcSwapToken[] = ["USDC", "EURC", "cirBTC"];

// A kit key is optional but strongly recommended — without one, requests
// run against a shared rate limit. Get one free from the Circle Console:
// https://console.circle.com
const KIT_KEY = import.meta.env.VITE_CIRCLE_KIT_KEY as string | undefined;

let kitSingleton: AppKit | null = null;
function getKit(): AppKit {
  if (!kitSingleton) kitSingleton = new AppKit();
  return kitSingleton;
}

function getEthereumProvider(): Eip1193Provider {
  const eth = typeof window !== "undefined" ? (window.ethereum as Eip1193Provider | undefined) : undefined;
  if (!eth) throw new Error("No wallet provider found — connect a wallet first.");
  return eth;
}

// 🛡️ Same-spirit fix as the Bridge page's resume banner, but scoped to what
// this SDK actually allows. Unlike CCTP (where tx.wait() hands back a burn
// tx hash we can persist *before* the second async wait for Iris), kit.swap()
// is a single opaque awaited call — there's no intermediate txHash checkpoint
// to save mid-flight. So instead of a fully automated resume, we persist the
// swap *intent* before calling, and on an interrupted session offer a manual
// "check status by tx hash" path using the SDK's own getSwapStatus() — which
// its own docs describe as "useful when resuming an in-flight swap from
// persisted state."
const PENDING_SWAP_KEY = "geomacro:swap:pending:v1";

export type PendingSwapIntent = { tokenIn: ArcSwapToken; tokenOut: ArcSwapToken; amountIn: string; startedAt: number };

export function savePendingSwapIntent(intent: PendingSwapIntent) {
  try {
    localStorage.setItem(PENDING_SWAP_KEY, JSON.stringify(intent));
  } catch {
    // localStorage unavailable — no resume banner possible, but the swap
    // itself is unaffected either way.
  }
}
export function loadPendingSwapIntent(): PendingSwapIntent | null {
  try {
    const raw = localStorage.getItem(PENDING_SWAP_KEY);
    return raw ? (JSON.parse(raw) as PendingSwapIntent) : null;
  } catch {
    return null;
  }
}
export function clearPendingSwapIntent() {
  try {
    localStorage.removeItem(PENDING_SWAP_KEY);
  } catch {
    // ignore
  }
}

export type SwapQuoteParams = {
  tokenIn: ArcSwapToken;
  tokenOut: ArcSwapToken;
  amountIn: string; // decimal string, e.g. "1.00" — NOT wei, App Kit handles decimals internally
};

export type SwapResult = {
  txHash: string;
  amountOut?: string;
  feeTxHash: string;
  feeUsdc: string;
};

/** Lets the UI show "+ $0.05 protocol fee" before the user confirms. */
export function previewSwapFeeUsdc(amountIn: string): string {
  if (!amountIn || Number(amountIn) <= 0) return "0.00";
  const feeWei = computeProtocolFeeWei(parseUnits(amountIn, 18));
  return formatFeeUsdc(feeWei);
}

/**
 * Executes a same-chain swap on Arc Testnet using the connected browser
 * wallet. Charges the protocol fee first (on top of amountIn, sent to
 * treasury) — if the fee payment fails or is rejected, the swap itself
 * never happens, so a fee is never silently skipped. Persists the swap
 * intent to localStorage before calling so an interrupted session
 * (refresh/crash mid-await) can be surfaced to the user afterward, and
 * clears it once the call resolves either way (success or a clean failure
 * — see the UI layer for how an ambiguous outcome is handled).
 */
export async function executeArcSwap({ tokenIn, tokenOut, amountIn }: SwapQuoteParams): Promise<SwapResult> {
  if (tokenIn === tokenOut) throw new Error("tokenIn and tokenOut must be different");

  const amountWei = parseUnits(amountIn, 18);
  const fee = await chargeProtocolFee(amountWei);

  const provider = getEthereumProvider();
  const adapter = await createEthersAdapterFromProvider({ provider });
  const kit = getKit();

  savePendingSwapIntent({ tokenIn, tokenOut, amountIn, startedAt: Date.now() });

  const result = await kit.swap({
    from: { adapter, chain: "Arc_Testnet" },
    tokenIn,
    tokenOut,
    amountIn,
    ...(KIT_KEY ? { config: { kitKey: KIT_KEY } } : {}),
  });

  clearPendingSwapIntent();
  return { txHash: result.txHash, amountOut: result.amountOut, feeTxHash: fee.txHash, feeUsdc: formatFeeUsdc(fee.feeWei) };
}

/**
 * Checks a swap's status by tx hash — the same lookup the SDK docs describe
 * for resuming an in-flight swap from persisted state. Same-chain swaps on
 * Arc Testnet settle in one transaction, so this is mainly useful for the
 * manual "I have a tx hash, is it done?" recovery path after an interrupted
 * session where we never captured a hash automatically.
 */
export async function checkArcSwapStatus(txHash: string): Promise<{ status: string; amountOut?: string }> {
  const kit = getKit();
  const status = await kit.getSwapStatus({
    txHash,
    chainIn: "Arc_Testnet",
    ...(KIT_KEY ? { kitKey: KIT_KEY } : {}),
  });
  return { status: status.progress.status, amountOut: status.destination?.amount };
}

