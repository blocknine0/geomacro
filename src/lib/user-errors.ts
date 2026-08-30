/**
 * User-facing error contract (Phase 1 foundation).
 *
 * Rule: normal users never see raw RPC / Supabase / contract errors as the
 * primary message. We map to plain language and keep the technical string
 * available behind an optional "Details" disclosure for advanced users.
 *
 * This module is presentation-only. It does not change any transaction,
 * SIWE, CCTP or Supabase behaviour.
 */

export type UserError = {
  /** Plain-language message shown to every user. */
  message: string;
  /** Raw technical string, shown only behind "Details". */
  detail?: string;
  /** True when retrying the same action is likely to help. */
  retryable: boolean;
};

function raw(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Translate any thrown value into a user-safe message.
 * `context` is a short human phrase, e.g. "loading this market".
 */
export function toUserError(error: unknown, context = "completing that action"): UserError {
  const detail = raw(error);
  const lower = detail.toLowerCase();

  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("action_rejected")
  ) {
    return { message: "You cancelled the request in your wallet.", detail, retryable: true };
  }
  if (lower.includes("insufficient funds") || lower.includes("insufficient balance")) {
    return {
      message:
        "Your wallet doesn't have enough balance to cover this transaction and its network fee.",
      detail,
      retryable: false,
    };
  }
  if (lower.includes("no wallet") || (lower.includes("ethereum") && lower.includes("undefined"))) {
    return { message: "No wallet was detected in this browser.", detail, retryable: false };
  }
  if (lower.includes("chain") && (lower.includes("mismatch") || lower.includes("unrecognized"))) {
    return {
      message: "Your wallet is on a different network. Switch networks and try again.",
      detail,
      retryable: true,
    };
  }
  if (lower.includes("revert") || lower.includes("execution reverted")) {
    return {
      message: "We couldn't complete the transaction. Please try again.",
      detail,
      retryable: true,
    };
  }
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout") ||
    lower.includes("rpc")
  ) {
    return {
      message: `We're having trouble reaching our data service while ${context}.`,
      detail,
      retryable: true,
    };
  }
  if (lower.includes("jwt") || lower.includes("unauthorized") || lower.includes("401")) {
    return { message: "Your session expired. Sign in again to continue.", detail, retryable: true };
  }

  return { message: `Something went wrong while ${context}.`, detail, retryable: true };
}

/**
 * Log for developers, return the user-safe error for the UI.
 * Always keeps the original error in the console.
 */
export function reportError(scope: string, error: unknown, context?: string): UserError {
  // Developer signal is intentionally preserved.
  console.error(`[${scope}]`, error);
  return toUserError(error, context);
}
