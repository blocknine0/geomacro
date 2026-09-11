export type GoatAgentSpendDecision = {
  allowed: boolean;
  reason:
    | "WITHIN_LIMIT"
    | "INVALID_PRICE"
    | "INVALID_LIMIT"
    | "PER_REQUEST_LIMIT_EXCEEDED"
    | "WINDOW_LIMIT_EXCEEDED";
  price_atomic: string;
  per_request_limit_atomic: string;
  spent_in_window_atomic: string;
  window_limit_atomic: string;
  remaining_window_atomic: string;
};

const POSITIVE_INTEGER = /^[1-9][0-9]{0,77}$/;
const NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]{0,77})$/;

function parsePositive(value: string): bigint | null {
  const normalized = value.trim();
  if (!POSITIVE_INTEGER.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function parseNonNegative(value: string): bigint | null {
  const normalized = value.trim();
  if (!NON_NEGATIVE_INTEGER.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

export function evaluateGoatAgentSpend(input: {
  price_atomic: string;
  per_request_limit_atomic: string;
  spent_in_window_atomic?: string;
  window_limit_atomic: string;
}): GoatAgentSpendDecision {
  const price = parsePositive(input.price_atomic);
  const perRequest = parsePositive(input.per_request_limit_atomic);
  const spent = parseNonNegative(input.spent_in_window_atomic ?? "0");
  const windowLimit = parsePositive(input.window_limit_atomic);

  if (price === null) {
    return {
      allowed: false,
      reason: "INVALID_PRICE",
      price_atomic: input.price_atomic,
      per_request_limit_atomic: input.per_request_limit_atomic,
      spent_in_window_atomic: input.spent_in_window_atomic ?? "0",
      window_limit_atomic: input.window_limit_atomic,
      remaining_window_atomic: "0",
    };
  }

  if (perRequest === null || spent === null || windowLimit === null || spent > windowLimit) {
    return {
      allowed: false,
      reason: "INVALID_LIMIT",
      price_atomic: input.price_atomic,
      per_request_limit_atomic: input.per_request_limit_atomic,
      spent_in_window_atomic: input.spent_in_window_atomic ?? "0",
      window_limit_atomic: input.window_limit_atomic,
      remaining_window_atomic: "0",
    };
  }

  const remaining = windowLimit - spent;

  if (price > perRequest) {
    return {
      allowed: false,
      reason: "PER_REQUEST_LIMIT_EXCEEDED",
      price_atomic: price.toString(),
      per_request_limit_atomic: perRequest.toString(),
      spent_in_window_atomic: spent.toString(),
      window_limit_atomic: windowLimit.toString(),
      remaining_window_atomic: remaining.toString(),
    };
  }

  if (price > remaining) {
    return {
      allowed: false,
      reason: "WINDOW_LIMIT_EXCEEDED",
      price_atomic: price.toString(),
      per_request_limit_atomic: perRequest.toString(),
      spent_in_window_atomic: spent.toString(),
      window_limit_atomic: windowLimit.toString(),
      remaining_window_atomic: remaining.toString(),
    };
  }

  return {
    allowed: true,
    reason: "WITHIN_LIMIT",
    price_atomic: price.toString(),
    per_request_limit_atomic: perRequest.toString(),
    spent_in_window_atomic: spent.toString(),
    window_limit_atomic: windowLimit.toString(),
    remaining_window_atomic: remaining.toString(),
  };
}
