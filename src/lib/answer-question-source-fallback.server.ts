import type { AgentAdaptiveQuery } from "./agent-query-plan";
import { CANONICAL_MAINNET_INTELLIGENCE_PATH } from "./mainnet-intelligence-endpoint.server";
import { supportsSourceGroundedResearchQuestion } from "./on-demand-research-answer.server";

type CanonicalPost = (input: {request: Request}) => Promise<Response>;
const RETRYABLE_NO_CHARGE_CODES = new Set([
  "STALE_REQUIRED_DATA",
  "INSUFFICIENT_COVERAGE",
  "UNAVAILABLE",
  "CAPABILITY_PRICE_UNVERIFIED_NO_CHARGE",
  "AVAILABILITY_CHECK_UNAVAILABLE",
  "COINBASE_X402_NOT_CONFIGURED",
  "COINBASE_X402_CONFIGURATION_INVALID",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function responsePayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await response.clone().json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function shouldTryResearchFallback(response: Response, payload: Record<string, unknown> | null): boolean {
  if (!payload || payload.execution_authorized !== false) return false;
  const error = isRecord(payload.error) ? payload.error : null;
  const code = typeof error?.code === "string" ? error.code : "";
  if (!RETRYABLE_NO_CHARGE_CODES.has(code)) return false;
  if (response.status === 422) {
    return payload.chargeable === false && payload.payment_required_now === false;
  }
  if (response.status === 503) {
    return payload.chargeable !== true && payload.payment_required_now !== true;
  }
  return false;
}

function canonicalRequest(
  original: Request,
  query: AgentAdaptiveQuery,
): Request {
  const headers = new Headers({"content-type": "application/json"});
  // Preserve only the edge identity used by existing rate controls and the
  // payment header. A request with a payment header is never retried as free.
  for (const name of ["cf-connecting-ip", "payment-signature"]) {
    const value = original.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(new URL(CANONICAL_MAINNET_INTELLIGENCE_PATH, original.url), {
    method: "POST",
    headers,
    body: JSON.stringify(query),
  });
}

/**
 * Answer Question first uses the exact canonical paid delivery path and its
 * fixed capability price. Only when that path explicitly refuses a charge
 * and no payment was supplied does a one-country request fall back to the
 * existing bounded live-news discovery path. Any result from that path stays
 * research-only and non-chargeable until the independent proof gates pass.
 */
export async function callCanonicalWithSourceResearchFallback(input: Readonly<{
  request: Request;
  toolName: string;
  query: AgentAdaptiveQuery;
  canonicalPost: CanonicalPost;
}>): Promise<Response> {
  const paidResponse = await input.canonicalPost({
    request: canonicalRequest(input.request, input.query),
  });
  if (
    input.toolName !== "answer_question" ||
    input.request.headers.has("payment-signature") ||
    paidResponse.status !== 422 && paidResponse.status !== 503 ||
    input.query.fulfillment_mode !== "published_only" ||
    !supportsSourceGroundedResearchQuestion(input.query.question) ||
    input.query.product?.capability !== "intelligence_query" ||
    input.query.subjects.length !== 1 ||
    input.query.subjects[0]?.type !== "country" ||
    input.query.as_of !== undefined ||
    input.query.ranking !== undefined ||
    input.query.change !== undefined ||
    input.query.risk_gate_context !== undefined ||
    input.query.topics.some(topic => ["risk_object", "risk_gate", "gri_context"].includes(topic))
  ) return paidResponse;

  const payload = await responsePayload(paidResponse);
  if (!shouldTryResearchFallback(paidResponse, payload)) return paidResponse;

  const researchQuery: AgentAdaptiveQuery = {
    ...input.query,
    fulfillment_mode: "live_on_demand",
  };
  return input.canonicalPost({
    request: canonicalRequest(input.request, researchQuery),
  });
}
