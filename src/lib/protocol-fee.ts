// src/lib/protocol-fee.ts
//
// Small protocol fee charged on top of the user's Bridge/Swap amount,
// sent directly to the existing treasury address already used by the live
// AgentArena.sol contract for winner-fee collection. Same percentage +
// floor/cap pattern discussed for the (not-yet-activated) V2 winner fee.
//
// Currency note: matches the rest of this codebase — Arc's native gas
// token IS USDC, so "$X" here means X * 10**18 wei (18 decimals), same
// convention as agent-arena.ts's ARC_USDC_DECIMALS.
import { BrowserProvider, type Eip1193Provider } from "ethers";

// Project-wide protocol fee recipient wallet used by Geomacro for
// Bridge/Swap fees. This is intentionally the fee recipient wallet, not the
// AgentArena V2 MultisigTreasury contract address.
export const TREASURY_ADDRESS = "0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5";

const FEE_BPS = 15n; // 0.15%
const FEE_FLOOR_WEI = 5n * 10n ** 16n; // $0.05
const FEE_CAP_WEI = 1n * 10n ** 18n; // $1.00

/**
 * Computes the protocol fee for a given amount, in wei (18-decimal, native
 * Arc USDC). Mirrors the same clamp pattern used elsewhere in this codebase
 * (percentage of amount, floor and cap).
 */
export function computeProtocolFeeWei(amountWei: bigint): bigint {
  const raw = (amountWei * FEE_BPS) / 10000n;
  if (raw < FEE_FLOOR_WEI) return FEE_FLOOR_WEI;
  if (raw > FEE_CAP_WEI) return FEE_CAP_WEI;
  return raw;
}

export type FeePaymentResult = { txHash: string; feeWei: bigint };

/**
 * Sends the protocol fee to the treasury address as a plain native-value
 * transfer. This is a real, separate transaction the user signs — it is
 * charged ON TOP of their Bridge/Swap amount, not deducted from it, so the
 * amount they bridge/swap arrives in full.
 */
export async function chargeProtocolFee(amountWei: bigint): Promise<FeePaymentResult> {
  const feeWei = computeProtocolFeeWei(amountWei);
  const eth = typeof window !== "undefined" ? (window as unknown as { ethereum?: Eip1193Provider }).ethereum : undefined;
  if (!eth) throw new Error("No wallet provider found — connect a wallet first.");

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const tx = await signer.sendTransaction({ to: TREASURY_ADDRESS, value: feeWei });
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Fee transaction did not confirm.");

  return { txHash: receipt.hash, feeWei };
}

/**
 * Pays an already-computed protocol fee exactly as supplied.
 *
 * Use this when the caller has already calculated the final USDC-denominated
 * fee, for example from a snapshotted Circle swap quote. Unlike
 * chargeProtocolFee(), this function does not apply FEE_BPS/floor/cap again.
 */
export async function chargeExactProtocolFeeWei(
  feeWei: bigint,
): Promise<FeePaymentResult> {
  if (feeWei <= 0n) {
    throw new Error("Protocol fee must be greater than zero.");
  }

  const eth =
    typeof window !== "undefined"
      ? (window as unknown as { ethereum?: Eip1193Provider }).ethereum
      : undefined;

  if (!eth) {
    throw new Error("No wallet provider found — connect a wallet first.");
  }

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const tx = await signer.sendTransaction({
    to: TREASURY_ADDRESS,
    value: feeWei,
  });

  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("Fee transaction did not confirm.");
  }

  return { txHash: receipt.hash, feeWei };
}

/** Formats a wei amount as a human-readable USDC string, e.g. "0.05". */
export function formatFeeUsdc(feeWei: bigint): string {
  const whole = feeWei / 10n ** 18n;
  const frac = feeWei % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, "0").slice(0, 2);
  return `${whole}.${fracStr}`;
}
