import process from "node:process";

const CONTROL_PLANE_TIMEOUT_MS = 3_500;

/**
 * Production commerce is exclusively backed by the verified Durable Object.
 * A stale environment override must never silently revive Supabase for
 * usage reservations, product audit, ledger claims or settlement telemetry.
 * Legacy Supabase mode remains available only to explicit nonproduction
 * fixtures; an unavailable DO always fails closed in production.
 */
export function resolveCommerceLedgerDurabilityPolicy(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined,
): boolean {
  const configured = String(configuredValue ?? "").trim().toLowerCase();
  const production = nodeEnvironment === "production";
  if (configured && configured !== "durable_object" && configured !== "supabase") {
    throw new Error("AGENT_COMMERCE_LEDGER_BACKEND_INVALID");
  }
  if (production) {
    if (configured === "supabase") {
      throw new Error("AGENT_PRODUCTION_SUPABASE_COMMERCE_FORBIDDEN");
    }
    return true;
  }
  return configured === "durable_object";
}

export function durableCommerceControlPlaneEnabled() {
  return resolveCommerceLedgerDurabilityPolicy(
    process.env.GEOMACRO_COMMERCE_LEDGER_BACKEND,
    process.env.NODE_ENV,
  );
}

function config() {
  const rawUrl = String(process.env.GEOMACRO_COMMERCE_LEDGER_URL ?? "").trim();
  const token = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
  if (!rawUrl || token.length < 32) {
    throw new Error("GEOMACRO_COMMERCE_CONTROL_PLANE_CONFIG_REQUIRED");
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("GEOMACRO_COMMERCE_CONTROL_PLANE_URL_INVALID");
  }
  if (url.protocol !== "https:") {
    throw new Error("GEOMACRO_COMMERCE_CONTROL_PLANE_HTTPS_REQUIRED");
  }
  return { url: url.toString().replace(/\/$/, ""), token };
}

export async function callCommerceControlPlane<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  if (!/^\/v1\/(?:usage|audit)\/[a-z-]+$/.test(path)) {
    throw new Error("GEOMACRO_COMMERCE_CONTROL_PLANE_PATH_INVALID");
  }
  const cfg = config();
  const response = await fetch(`${cfg.url}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(CONTROL_PLANE_TIMEOUT_MS),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`GEOMACRO_COMMERCE_CONTROL_PLANE_HTTP_${response.status}`);
  }
  return body as T;
}
