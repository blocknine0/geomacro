// src/lib/swap.ts
//
// Circle App Kit swap wrapper for Arc Testnet.
// Geomacro intentionally supports only pairs that include USDC.
import { AppKit } from "@circle-fin/app-kit";
import { createEthersAdapterFromProvider } from "@circle-fin/adapter-ethers-v6";
import { parseUnits, type Eip1193Provider } from "ethers";
import {
  TREASURY_ADDRESS,
  chargeExactProtocolFeeWei,
  computeProtocolFeeWei,
  formatFeeUsdc,
} from "./protocol-fee";

export type ArcSwapToken = "USDC" | "EURC" | "cirBTC";
export const ARC_SWAP_TOKENS: ArcSwapToken[] = ["USDC", "EURC", "cirBTC"];
export const DEFAULT_SWAP_SLIPPAGE_BPS = 50;
export const MIN_SWAP_SLIPPAGE_BPS = 50;
export const MAX_SWAP_SLIPPAGE_BPS = 500;

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

function assertSupportedPair(tokenIn: ArcSwapToken, tokenOut: ArcSwapToken) {
  if (tokenIn === tokenOut) throw new Error("tokenIn and tokenOut must be different");
  if (tokenIn !== "USDC" && tokenOut !== "USDC") {
    throw new Error("Geomacro supports only USDC ↔ EURC and USDC ↔ cirBTC swaps.");
  }
}

function normalizeSlippageBps(value: number | undefined): number {
  const candidate = Number.isFinite(value) ? Math.round(value as number) : DEFAULT_SWAP_SLIPPAGE_BPS;
  return Math.min(MAX_SWAP_SLIPPAGE_BPS, Math.max(MIN_SWAP_SLIPPAGE_BPS, candidate));
}

const PENDING_SWAP_KEY = "geomacro:swap:pending:v2";

export type PendingSwapIntent = {
  tokenIn: ArcSwapToken;
  tokenOut: ArcSwapToken;
  amountIn: string;
  slippageBps: number;
  startedAt: number;
};

export function savePendingSwapIntent(intent: PendingSwapIntent) {
  try {
    localStorage.setItem(PENDING_SWAP_KEY, JSON.stringify(intent));
  } catch {
    // Recovery metadata is best-effort only.
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
  amountIn: string;
  slippageBps?: number;
};

export type ExecuteSwapParams = SwapQuoteParams & {
  minimumOutput: string;
  geomacroFeeUsdc: string;
};

async function getSwapInputUsdValue(token: ArcSwapToken, amount: string): Promise<string> {
  if (token === "USDC") return amount;

  const kit = getKit();
  const { rates } = await kit.getTokenRates({
    chain: "Arc_Testnet",
    tokens: [token],
  });
  const chainRates = rates["Arc_Testnet"] ?? {};
  const rate = Object.values(chainRates)[0];
  if (!rate) throw new Error(`No Circle USD rate available for ${token}.`);

  const price = Number(rate.priceUSD);
  const quantity = Number(amount);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid Circle USD rate for ${token}.`);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Invalid swap amount.");
  return (quantity * price).toFixed(18);
}

export type SwapQuote = {
  estimatedOutput: string;
  minimumOutput: string;
  geomacroFeeUsdc: string;
  slippageBps: number;
  feeMode: "circle_custom_fee" | "post_swap_usdc";
  fees: readonly {
    token: string;
    amount: string | null;
    type: "provider" | "swap" | "gas" | "developer" | "kit";
  }[];
};

export type SwapResult = {
  txHash: string;
  amountOut?: string;
  status: string;
  feeTxHash?: string;
  feeUsdc?: string;
  feeError?: string;
  feeMode: "circle_custom_fee" | "post_swap_usdc";
};

export async function estimateArcSwap({
  tokenIn,
  tokenOut,
  amountIn,
  slippageBps,
}: SwapQuoteParams): Promise<SwapQuote> {
  assertSupportedPair(tokenIn, tokenOut);
  if (!amountIn || Number(amountIn) <= 0) throw new Error("Enter an amount greater than 0.");

  const normalizedSlippageBps = normalizeSlippageBps(slippageBps);
  const provider = getEthereumProvider();
  const adapter = await createEthersAdapterFromProvider({ provider });
  const kit = getKit();

  const inputUsdValue = await getSwapInputUsdValue(tokenIn, amountIn);
  const feeWei = computeProtocolFeeWei(parseUnits(inputUsdValue, 18));
  const geomacroFeeUsdc = formatFeeUsdc(feeWei);
  const feeMode = tokenIn === "USDC" ? "circle_custom_fee" : "post_swap_usdc";

  const estimate = await kit.estimateSwap({
    from: { adapter, chain: "Arc_Testnet" },
    tokenIn,
    tokenOut,
    amountIn,
    config: {
      allowanceStrategy: "permit",
      slippageBps: normalizedSlippageBps,
      ...(feeMode === "circle_custom_fee"
        ? {
            customFee: {
              value: geomacroFeeUsdc,
              recipientAddress: TREASURY_ADDRESS,
            },
          }
        : {}),
    },
  });

  return {
    estimatedOutput: estimate.estimatedOutput.amount,
    minimumOutput: estimate.stopLimit.amount,
    geomacroFeeUsdc,
    slippageBps: normalizedSlippageBps,
    feeMode,
    fees: (estimate.fees ?? []) as SwapQuote["fees"],
  };
}

export async function executeArcSwap({
  tokenIn,
  tokenOut,
  amountIn,
  slippageBps,
  minimumOutput,
  geomacroFeeUsdc,
}: ExecuteSwapParams): Promise<SwapResult> {
  assertSupportedPair(tokenIn, tokenOut);
  if (!minimumOutput || Number(minimumOutput) <= 0) throw new Error("A valid minimum output is required.");

  const normalizedSlippageBps = normalizeSlippageBps(slippageBps);
  const feeMode = tokenIn === "USDC" ? "circle_custom_fee" : "post_swap_usdc";
  const provider = getEthereumProvider();
  const adapter = await createEthersAdapterFromProvider({ provider });
  const kit = getKit();

  savePendingSwapIntent({
    tokenIn,
    tokenOut,
    amountIn,
    slippageBps: normalizedSlippageBps,
    startedAt: Date.now(),
  });

  const result = await kit.swap({
    from: { adapter, chain: "Arc_Testnet" },
    tokenIn,
    tokenOut,
    amountIn,
    config: {
      allowanceStrategy: "permit",
      slippageBps: normalizedSlippageBps,
      stopLimit: minimumOutput,
      ...(feeMode === "circle_custom_fee"
        ? {
            customFee: {
              value: geomacroFeeUsdc,
              recipientAddress: TREASURY_ADDRESS,
            },
          }
        : {}),
    },
  });

  if (result.progress.status !== "DONE") {
    return {
      txHash: result.txHash,
      amountOut: result.amountOut,
      status: result.progress.status,
      feeMode,
    };
  }

  clearPendingSwapIntent();

  // Circle custom fees are collected in the input token. To preserve the
  // permanent Geomacro rule that its own fee is USDC-only, reverse swaps
  // (EURC/cirBTC -> USDC) cannot use Circle customFee. They settle the swap
  // first, then collect the quoted fee as native Arc USDC. USDC-input swaps
  // use Circle's integrated custom fee and require no second Geomacro tx.
  if (feeMode === "circle_custom_fee") {
    return {
      txHash: result.txHash,
      amountOut: result.amountOut,
      status: result.progress.status,
      feeUsdc: geomacroFeeUsdc,
      feeMode,
    };
  }

  try {
    const fee = await chargeExactProtocolFeeWei(parseUnits(geomacroFeeUsdc, 18));
    return {
      txHash: result.txHash,
      amountOut: result.amountOut,
      status: result.progress.status,
      feeTxHash: fee.txHash,
      feeUsdc: formatFeeUsdc(fee.feeWei),
      feeMode,
    };
  } catch (error) {
    return {
      txHash: result.txHash,
      amountOut: result.amountOut,
      status: result.progress.status,
      feeMode,
      feeError: error instanceof Error
        ? error.message
        : "USDC protocol fee collection failed after the swap completed.",
    };
  }
}

export async function checkArcSwapStatus(txHash: string): Promise<{ status: string; amountOut?: string }> {
  const kit = getKit();
  const status = await kit.getSwapStatus({
    txHash,
    chainIn: "Arc_Testnet",
  });
  return { status: status.progress.status, amountOut: status.destination?.amount };
}
