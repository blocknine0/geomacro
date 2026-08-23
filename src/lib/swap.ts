// src/lib/swap.ts
//
// Wraps Circle's App Kit Swap capability (docs.arc.io/app-kit/swap).
// Arc Testnet only supports swapping between USDC, EURC, and cirBTC — App
// Kit supports more tokens on other chains, but we only ever call this
// with chain: "Arc_Testnet", so we constrain the type to match.
import { AppKit } from "@circle-fin/app-kit";
import { createEthersAdapterFromProvider } from "@circle-fin/adapter-ethers-v6";
import { parseUnits, type Eip1193Provider } from "ethers";
import {
  chargeExactProtocolFeeWei,
  computeProtocolFeeWei,
  formatFeeUsdc,
} from "./protocol-fee";

export type ArcSwapToken = "USDC" | "EURC" | "cirBTC";
export const ARC_SWAP_TOKENS: ArcSwapToken[] = ["USDC", "EURC", "cirBTC"];

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

export type ExecuteSwapParams = SwapQuoteParams & {
  geomacroFeeUsdc: string;
};

async function getSwapInputUsdValue(
  token: ArcSwapToken,
  amount: string,
): Promise<string> {
  const kit = getKit();

  const { rates } = await kit.getTokenRates({
    chain: "Arc_Testnet",
    tokens: [token],
  });

  const chainRates = rates["Arc_Testnet"] ?? {};
  const rate = Object.values(chainRates)[0];

  if (!rate) {
    if (token === "USDC") return amount;
    throw new Error(`No Circle USD rate available for ${token}.`);
  }

  const price = Number(rate.priceUSD);
  const quantity = Number(amount);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid Circle USD rate for ${token}.`);
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Invalid swap amount.");
  }

  return (quantity * price).toFixed(18);
}

export type SwapQuote = {
  estimatedOutput: string;
  minimumOutput: string;
  geomacroFeeUsdc: string;
  fees: readonly {
    token: string;
    amount: string | null;
    type: "provider" | "swap" | "gas" | "developer";
  }[];
};

export type SwapResult = {
  txHash: string;
  amountOut?: string;
  status: string;
  feeTxHash?: string;
  feeUsdc?: string;
  feeError?: string;
};

export async function estimateArcSwap({
  tokenIn,
  tokenOut,
  amountIn,
}: SwapQuoteParams): Promise<SwapQuote> {
  if (tokenIn === tokenOut) {
    throw new Error("tokenIn and tokenOut must be different");
  }

  if (!amountIn || Number(amountIn) <= 0) {
    throw new Error("Enter an amount greater than 0.");
  }

  const provider = getEthereumProvider();
  const adapter = await createEthersAdapterFromProvider({ provider });
  const kit = getKit();

  const estimate = await kit.estimateSwap({
    from: { adapter, chain: "Arc_Testnet" },
    tokenIn,
    tokenOut,
    amountIn,
  });

  const inputUsdValue = await getSwapInputUsdValue(tokenIn, amountIn);
  const feeWei = computeProtocolFeeWei(parseUnits(inputUsdValue, 18));

  return {
    estimatedOutput: estimate.estimatedOutput.amount,
    minimumOutput: estimate.stopLimit.amount,
    geomacroFeeUsdc: formatFeeUsdc(feeWei),
    fees: estimate.fees ?? [],
  };
}

/**
 * Executes a same-chain swap on Arc Testnet using the connected browser
 * wallet. The protocol fee is charged separately after App Kit confirms
 * the same-chain swap transaction, so a rejected or reverted swap never
 * leaves the user paying a Geomacro fee for no swap. Persists the swap
 * intent to localStorage before calling so an interrupted session
 * (refresh/crash mid-await) can be surfaced to the user afterward, and
 * clears it once the call resolves either way (success or a clean failure
 * — see the UI layer for how an ambiguous outcome is handled).
 */
export async function executeArcSwap({
  tokenIn,
  tokenOut,
  amountIn,
  geomacroFeeUsdc,
}: ExecuteSwapParams): Promise<SwapResult> {
  if (tokenIn === tokenOut) throw new Error("tokenIn and tokenOut must be different");

  const provider = getEthereumProvider();
  const adapter = await createEthersAdapterFromProvider({ provider });
  const kit = getKit();

  savePendingSwapIntent({ tokenIn, tokenOut, amountIn, startedAt: Date.now() });

  const result = await kit.swap({
    from: { adapter, chain: "Arc_Testnet" },
    tokenIn,
    tokenOut,
    amountIn,
  });

  if (result.progress.status !== "DONE") {
    return {
      txHash: result.txHash,
      amountOut: result.amountOut,
      status: result.progress.status,
    };
  }

  clearPendingSwapIntent();

  // The swap itself is already complete at this point. Fee collection is a
  // separate transaction and must never turn a successful swap into a
  // reported swap failure.
  try {
    const fee = await chargeExactProtocolFeeWei(
      parseUnits(geomacroFeeUsdc, 18),
    );

    return {
      txHash: result.txHash,
      amountOut: result.amountOut,
      status: result.progress.status,
      feeTxHash: fee.txHash,
      feeUsdc: formatFeeUsdc(fee.feeWei),
    };
  } catch (error) {
    return {
      txHash: result.txHash,
      amountOut: result.amountOut,
      status: result.progress.status,
      feeError:
        error instanceof Error
          ? error.message
          : "Protocol fee collection failed after the swap completed.",
    };
  }
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
  });
  return { status: status.progress.status, amountOut: status.destination?.amount };
}

