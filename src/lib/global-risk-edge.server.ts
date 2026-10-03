import type { GlobalRisk } from "./global-risk.types";
import { validateGlobalRiskContinuity } from "./global-risk-continuity";

const EDGE_URL = "https://geomacro-global-risk.daspallab202391.workers.dev/global-risk";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function recentEnough(value: unknown): boolean {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) && parsed <= Date.now() + 5 * 60_000 && Date.now() - parsed <= MAX_AGE_MS;
}

export async function readGlobalRiskEdge(): Promise<GlobalRisk | null> {
  try {
    const response = await fetch(EDGE_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4_500),
    });
    if (!response.ok || response.headers.get("x-geomacro-authority") !== "backblaze-b2-verified-edge") {
      return null;
    }

    const payload = await response.json() as {
      schema?: string;
      generated_at?: string;
      source_project?: string;
      data?: GlobalRisk;
    };
    if (
      payload.schema !== "geomacro.public-global-risk-live.v1" ||
      payload.source_project !== "ldpwajisioljyjtojvfx" ||
      !recentEnough(payload.generated_at) ||
      !payload.data ||
      payload.data.methodologyVersion !== "gri-v1.2.0" ||
      payload.data.verificationStatus !== "verified" ||
      !validateGlobalRiskContinuity(payload.data).ok
    ) return null;

    return payload.data;
  } catch {
    return null;
  }
}
