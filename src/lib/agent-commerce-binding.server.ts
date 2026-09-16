import { createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";

export const AGENT_COMMERCE_BINDING_VERSION = "geomacro.agent-commerce-binding.v1" as const;
const KEY_BYTES = 32;

function bindingKey() {
  const raw = process.env.AGENT_COMMERCE_BINDING_KEY_B64?.trim();
  if (!raw) throw new Error("AGENT_COMMERCE_BINDING_KEY_MISSING");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) throw new Error("AGENT_COMMERCE_BINDING_KEY_MUST_BE_32_BYTES");
  return key;
}

export function agentCommercePaymentBinding(input: {
  productId: string;
  queryPlanHash: string;
  amountAtomic: string;
  network: string;
  asset: string;
  payTo: string;
}) {
  if (!/^[0-9a-f]{64}$/.test(input.queryPlanHash)) throw new Error("INVALID_QUERY_PLAN_HASH");
  const canonical = [
    AGENT_COMMERCE_BINDING_VERSION,
    input.productId,
    input.queryPlanHash,
    input.amountAtomic,
    input.network.toLowerCase(),
    input.asset.toLowerCase(),
    input.payTo.toLowerCase(),
  ].join("\n");
  return createHmac("sha256", bindingKey()).update(canonical, "utf8").digest("hex");
}

export function assertAgentCommercePaymentBinding(actual: unknown, expected: string) {
  if (typeof actual !== "string" || !/^[0-9a-f]{64}$/.test(actual) || !/^[0-9a-f]{64}$/.test(expected)) {
    throw new Error("PAYMENT_QUERY_BINDING_INVALID");
  }
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("PAYMENT_QUERY_BINDING_MISMATCH");
}

export function agentCommerceBindingConfigured() {
  try {
    bindingKey();
    return true;
  } catch {
    return false;
  }
}
