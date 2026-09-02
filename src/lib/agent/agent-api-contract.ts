/**
 * Canonical, transport-agnostic contract for the Geomacro Agent Intelligence API.
 *
 * This file is intentionally free of server-only imports so that it can be
 * shared by route handlers, tests, docs tooling and (later) an MCP server or
 * a public SDK without dragging Supabase or payment code along.
 */

/** Public API surface version. Bumped on breaking route/behaviour changes. */
export const GEOMACRO_AGENT_API_VERSION = "1.0.0";

/** Payload schema version. Bumped on breaking response-shape changes. */
export const GEOMACRO_AGENT_SCHEMA_VERSION = "geomacro-agent-intelligence-v1";

/** Stable machine-readable error codes. Never leak provider internals. */
export const AGENT_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  INTELLIGENCE_NOT_FOUND: "INTELLIGENCE_NOT_FOUND",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  PAYMENT_INVALID: "PAYMENT_INVALID",
  PAYMENT_SETTLEMENT_FAILED: "PAYMENT_SETTLEMENT_FAILED",
  PAYMENT_NOT_CONFIGURED: "PAYMENT_NOT_CONFIGURED",
  RATE_LIMITED: "RATE_LIMITED",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[keyof typeof AGENT_ERROR_CODES];

const ERROR_MESSAGES: Record<AgentErrorCode, string> = {
  INVALID_REQUEST: "The request was malformed or contained an unsupported parameter.",
  INTELLIGENCE_NOT_FOUND: "The requested intelligence record was not found.",
  PAYMENT_REQUIRED: "Payment is required to access this capability.",
  PAYMENT_INVALID: "The supplied payment could not be verified.",
  PAYMENT_SETTLEMENT_FAILED: "The payment could not be settled. No intelligence was delivered.",
  PAYMENT_NOT_CONFIGURED: "This capability is not currently available for purchase.",
  RATE_LIMITED: "Too many requests. Please retry later.",
  UPSTREAM_UNAVAILABLE: "The intelligence store is temporarily unavailable.",
  INTERNAL_ERROR: "An unexpected error occurred.",
};

export const AGENT_ERROR_STATUS: Record<AgentErrorCode, number> = {
  INVALID_REQUEST: 400,
  INTELLIGENCE_NOT_FOUND: 404,
  PAYMENT_REQUIRED: 402,
  PAYMENT_INVALID: 402,
  PAYMENT_SETTLEMENT_FAILED: 402,
  PAYMENT_NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export type AgentApiError = {
  error: {
    code: AgentErrorCode;
    message: string;
    /** Optional non-sensitive machine hints (e.g. x402 payment requirements). */
    details?: Record<string, unknown>;
  };
};

export function agentError(code: AgentErrorCode, details?: Record<string, unknown>): AgentApiError {
  const body: AgentApiError = { error: { code, message: ERROR_MESSAGES[code] } };
  if (details) body.error.details = details;
  return body;
}

/** Capability identifiers. Stable strings — these are billed against. */
export const AGENT_CAPABILITIES = {
  EVENT_INTELLIGENCE: "event.intelligence.v1",
} as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[keyof typeof AGENT_CAPABILITIES];
